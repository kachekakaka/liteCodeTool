import { finite, validId, entityTarget } from '../src/engine/core.ts';

/**
 * 校验并将外部单位转换成平台单位；已有身份从实体池继承。
 * @param envelope - 待接收的增量包，不原地修改。
 * @param schemas - 当前模式定义。
 * @param store - 实体池，用于检查已有记录身份和重复来源。
 * @param inputUnits - projectile 输入单位配置，包含 default 与 sources 覆盖。
 * @returns 规范化增量包；无效输入抛出 Error，由 HTTP 层转换为 400。
 */
export function validateEnvelope(envelope, schemas, store, inputUnits = {}) {
  const schema = schemas.find((s) => s.type === envelope?.type);
  if (
    !schema ||
    !finite(envelope.timestamp) ||
    envelope.timestamp > Date.now() + 60_000 ||
    !envelope.data ||
    typeof envelope.data !== 'object' ||
    Array.isArray(envelope.data) ||
    (schema.isEntity ? !validId(envelope.id) : envelope.id !== undefined)
  )
    throw new Error('增量包的类型、标识、时间戳或数据无效');
  const data = { ...envelope.data };
  for (const [key, value] of Object.entries(data)) {
    const field = schema.fields.find((f) => f.key === key);
    if (
      !field ||
      (value !== null && (field.type === 'number' ? !finite(value) : typeof value !== 'string'))
    )
      throw new Error(`字段 ${key} 不符合数据模式`);
    if (field.type === 'datetime' && value !== null && Number.isNaN(new Date(value).getTime()))
      throw new Error('报位时间无效');
    if (key === schema.idField && value !== envelope.id)
      throw new Error('实体标识与数据中的标识不一致');
  }
  const previous = store.get(schema.type, envelope.id);
  if (schema.targetIdField) {
    const targetField = schema.targetIdField;
    const sourceField = schema.sourceField ?? 'source';
    // 兼容旧单源首次接入：目标缺失可采用记录 ID，来源缺失为无来源单源。
    const target = data[targetField] ?? previous?.data[targetField] ?? envelope.id;
    const source = data[sourceField] ?? previous?.data[sourceField] ?? '';
    if (!validId(target) || typeof source !== 'string' || source.length > 80)
      throw new Error('业务目标或数据来源无效');
    for (const key of [targetField, sourceField]) {
      if (Object.hasOwn(data, key) && data[key] === null) throw new Error('不能清空记录身份字段');
      if (
        previous &&
        Object.hasOwn(data, key) &&
        data[key] !== (previous.data[key] ?? (key === targetField ? envelope.id : ''))
      )
        throw new Error('同一记录 ID 不能更换业务目标或来源，请使用新的记录 ID');
    }
    if (
      store
        .list(schema.type)
        .some(
          (row) =>
            row.id !== envelope.id &&
            entityTarget(row.id, row.record, schema.type, schema) === target &&
            (row.record.data[sourceField] ?? '') === source,
        )
    )
      throw new Error('该业务目标与来源已存在其他记录 ID');
    if (!previous) {
      data[targetField] = target;
      data[sourceField] = source;
    }
    if (schema.type === 'projectile') {
      const units = {
        altitude: 'km',
        speed: 'km/h',
        ...inputUnits.default,
        ...inputUnits.sources?.[source],
      };
      if (!['m', 'km'].includes(units.altitude) || !['m/s', 'km/h'].includes(units.speed))
        throw new Error('接入单位配置无效');
      for (const [field, factor] of [
        ['altitude', units.altitude === 'm' ? 0.001 : 1],
        ['speed', units.speed === 'm/s' ? 3.6 : 1],
      ]) {
        if (finite(data[field])) {
          data[field] *= factor;
          if (!finite(data[field])) throw new Error('度量换算结果超出范围');
        }
      }
    }
  }
  return {
    type: envelope.type,
    ...(envelope.id ? { id: envelope.id } : {}),
    timestamp: envelope.timestamp,
    data,
  };
}
