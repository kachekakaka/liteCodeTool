/**
 * 可通过数据协议传递的标量；null 表示明确上报的空值，字段缺失则表示本次未提供。
 */
export type Scalar = string | number | boolean | null;
/**
 * 平台支持的原子控件类型，分别对应文本、数值、时间、指示灯、表格、曲线、图片和消息流。
 */
export type ControlType =
  'text' | 'number' | 'time' | 'light' | 'table' | 'line' | 'image' | 'stream';
/**
 * 数据模式中的字段元信息，供绑定选择、格式化与接入校验共用。
 */
export interface Field {
  /**
   * 字段键名，与数据包 data 中的键一致。
   */
  key: string;
  /**
   * 界面显示的中文字段名称。
   */
  name: string;
  /**
   * 字段类型；datetime 使用可解析日期值，enum 使用字符串选项。
   */
  type: 'string' | 'number' | 'enum' | 'datetime';
  /**
   * 可选显示单位，例如节、度或艘。
   */
  unit?: string;
  /**
   * 数值默认小数位；控件可显式覆盖。
   */
  precision?: number;
  /**
   * 枚举字段的可选字符串列表。
   */
  options?: string[];
}
/**
 * 一种实体或全局数据的数据模式，声明字段、身份规则及展示名称。
 */
export interface Schema {
  /**
   * 数据模式唯一标识，与 Envelope.type 和槽位 schemaType 对应。
   */
  type: string;
  /**
   * 数据模式的显示名称。
   */
  name: string;
  /**
   * true 表示存在多个独立实体，false 表示单份全局数据。
   */
  isEntity: boolean;
  /**
   * 实体标识字段键名；全局模式可省略。
   */
  idField?: string;
  /** 业务目标字段；多来源记录可共享同一目标，区别于记录 ID。 */
  targetIdField?: string;
  /** 物理观测来源字段，配合业务目标确定一条观测记录。 */
  sourceField?: string;
  /**
   * 该模式允许上报和绑定的字段定义。
   */
  fields: Field[];
}
/**
 * 组件模板声明的对象槽位；实例通过槽位 ID 指派具体实体。
 */
export interface Slot {
  /**
   * 模板内唯一槽位 ID，不直接代表实体 ID。
   */
  id: string;
  /**
   * 面向用户的槽位名称，例如对象1。
   */
  label: string;
  /**
   * 允许指派的实体数据模式标识。
   */
  schemaType: string;
}
/**
 * 位置与尺寸使用父画布的逻辑像素，独立于浏览器显示缩放。
 */
export interface Geometry {
  /**
   * 左上角相对父画布左边缘的横坐标。
   */
  x: number;
  /**
   * 左上角相对父画布上边缘的纵坐标。
   */
  y: number;
  /**
   * 逻辑宽度。
   */
  w: number;
  /**
   * 逻辑高度。
   */
  h: number;
}
/**
 * 单个控件字段的完整寻址单元；修改或覆盖时整体替换。
 */
export interface Binding {
  /**
   * slot 从对象槽位取实体数据，global 从全局模式取数据。
   */
  target: 'slot' | 'global';
  /**
   * target 为 slot 时使用的模板槽位 ID。
   */
  slotId?: string;
  /**
   * target 为 global 时使用的非实体数据模式标识。
   */
  schemaType?: string;
  /**
   * 需要读取的字段键名。
   */
  field: string;
}
/**
 * 曲线中的一条数值序列，可来自实体槽位或全局数据。
 */
export interface Series {
  /**
   * 序列来源；省略时按控件绑定等上下文兼容旧配置。
   */
  target?: 'slot' | 'global';
  /**
   * 实体曲线使用的对象槽位 ID。
   */
  slotId?: string;
  /**
   * 全局曲线使用的数据模式标识。
   */
  schemaType?: string;
  /**
   * 用于纵轴的数值字段键名。
   */
  field: string;
  /**
   * 曲线颜色；省略时由图表采用默认配色。
   */
  color?: string;
  /**
   * 可选曲线显示名称。
   */
  label?: string;
  /**
   * 曲线归属的 Y 轴：left 为左轴（默认），right 为右轴。
   */
  yAxis?: 'left' | 'right';
  /**
   * 可选数据源过滤，用于在多源探测（如雷达/遥测）时限定曲线来源。
   */
  filterSource?: string;
}
/**
 * 表格列级状态颜色规则集合。
 */
export interface TableColumnRule {
  /**
   * 目标列的字段键名。
   */
  field: string;
  /**
   * 该列匹配的有序颜色规则。
   */
  rules: {
    value: Scalar;
    color: string;
  }[];
}
/**
 * 各类控件共用的属性集合；属性均可省略，具体默认值由对应控件和校验逻辑决定。
 */
export interface ControlProps {
  /**
   * static 使用固定内容，dynamic 读取绑定字段；省略时兼容旧绑定配置。
   */
  sourceMode?: 'static' | 'dynamic';
  /**
   * 固定内容原始值；null 表示明确空值。
   */
  staticValue?: Scalar;
  /**
   * 控件标签文案。
   */
  label?: string;
  /**
   * auto 继承字段名称，custom 使用 label。
   */
  labelMode?: 'auto' | 'custom';
  /**
   * 控件自定义单位文本。
   */
  unit?: string;
  /**
   * auto 继承字段单位，custom 使用 unit。
   */
  unitMode?: 'auto' | 'custom';
  /**
   * 指定显示小数位；null 或省略表示使用字段默认精度或原值。
   */
  precision?: number | null;
  /**
   * 曲线历史窗口长度单位：minute 表示分钟（默认），second 表示秒。
   */
  lookbackUnit?: 'second' | 'minute';
  /**
   * 曲线历史窗口长度，单位秒，允许 10～600。
   */
  lookbackSeconds?: number;
  /**
   * 曲线历史窗口长度，单位分钟，允许 1～60。
   */
  lookbackMinutes?: number;
  /**
   * 表格列级状态颜色规则列表。
   */
  tableColumnRules?: TableColumnRule[];
  /**
   * 消息流最大留存条数，默认 50。
   */
  streamMaxItems?: number;
  /**
   * 消息流是否自动滚动吸底，默认 true。
   */
  streamAutoScroll?: boolean;
  /**
   * 时序曲线相邻点允许连接的最大时间间隔，单位秒。
   */
  gapSeconds?: number;
  /**
   * 数据过期阈值，单位秒；非正数关闭判定。
   */
  staleSeconds?: number;
  /**
   * 表格是否启用整行过期显示，省略时由表格默认策略决定。
   */
  staleEnabled?: boolean;
  /**
   * 图表数值序列集合，最多 8 条；覆盖时整体替换。
   */
  series?: Series[];
  /**
   * 表格展示列的字段键名，数组顺序即列顺序。
   */
  columns?: string[];
  /**
   * 表格所使用的实体数据模式标识。
   */
  schemaType?: string;
  /**
   * 表格等值过滤的字段键名；省略时不过滤。
   */
  filterField?: string;
  /**
   * 与过滤字段比较的标量值。
   */
  filterValue?: Scalar;
  /**
   * 表格每页行数，允许 1～20。
   */
  pageSize?: number;
  /**
   * 指示灯按值匹配颜色的有序规则，最多 30 条。
   */
  colorRules?: {
    /**
     * 需要匹配的状态标量值。
     */
    value: Scalar;
    /**
     * 匹配后使用的六位十六进制颜色。
     */
    color: string;
  }[];
  /**
   * radar 和 sonar 使用内置效果，image 使用图片地址。
   */
  imageType?: 'radar' | 'sonar' | 'image';
  /**
   * 图片或 KPI 图标地址；内嵌图片使用允许格式的 Base64 Data URL。
   */
  imageUrl?: string;
  /**
   * 图片的替代文本。
   */
  alt?: string;
  /**
   * 是否将当前时钟作为静态控件值。
   */
  clock?: boolean;
  /**
   * 数值控件样式：standard 为普通数值，kpi 为指标卡。
   */
  variant?: 'standard' | 'kpi';
  /**
   * KPI 内置图标类型，none 表示不显示图标。
   */
  iconType?: 'vessel' | 'cargo' | 'fishing' | 'alert' | 'none';
  /**
   * 表格自动翻页间隔，单位秒；非正数关闭自动翻页。
   */
  autoPageSeconds?: number;
  /**
   * time 以时间为横轴，field 将 X/Y 数值字段组成航迹。
   */
  xAxisMode?: 'time' | 'field';
  /**
   * 字段横轴使用的数值字段键名。
   */
  xAxisField?: string;
  /**
   * 字段横轴指定的对象槽位 ID；省略时由图表上下文回退。
   */
  xAxisSlotId?: string;
  /**
   * 图表选择的数据模式上下文，用于字段与序列配置。
   */
  xAxisSchemaType?: string;
  /**
   * 仅兼容读取旧配置；载入、保存与导出时剥离，新预览存于工坊会话状态。
   */
  workshopPreviewTarget?: string;
}
/**
 * 模板内的原子控件定义，实例可通过 Override 私有化其样式、属性和绑定。
 */
export interface Control {
  /**
   * 模板内唯一控件 ID，用作覆盖映射键。
   */
  id: string;
  /**
   * 控件类型。
   */
  type: ControlType;
  /**
   * 相对模板画布的几何信息与可选字号、颜色。
   */
  style: Geometry & {
    /**
     * 控件基础字号，单位像素。
     */
    fontSize?: number;
    /**
     * 控件文字或主题颜色。
     */
    color?: string;
  };
  /**
   * 控件专属属性集合。
   */
  props: ControlProps;
  /**
   * 动态字段绑定；null 或省略表示没有显式字段绑定。
   */
  binding?: Binding | null;
}
/**
 * 实例对单个控件的稀疏覆盖；未出现的字段继续继承模板。
 */
export interface Override {
  /**
   * 仅覆盖提供的几何或样式字段。
   */
  style?: Partial<Control['style']>;
  /**
   * 仅覆盖提供的控件属性，数组值整体替换。
   */
  props?: Partial<ControlProps>;
  /**
   * 提供时整体替换绑定；null 清除绑定，省略则保持继承。
   */
  binding?: Binding | null;
}
/**
 * 可重复使用的组件模板，定义布局、对象槽位、控件与默认标题配置。
 */
export interface ComponentTemplate {
  /**
   * 模板资源唯一标识。
   */
  id: string;
  /**
   * 模板名称，也是实例没有私有标题时的默认标题。
   */
  name: string;
  /**
   * 资产库分类名称。
   */
  category: string;
  /**
   * 模板画布逻辑尺寸，单位像素。
   */
  layout: {
    /**
     * 模板逻辑画布宽度，单位像素。
     */
    width: number;
    /**
     * 模板逻辑画布高度，单位像素。
     */
    height: number;
  };
  /**
   * 模板声明的对象槽位列表。
   */
  slots: Slot[];
  /**
   * 模板内原子控件列表。
   */
  controls: Control[];
  /**
   * 是否显示标题栏；省略时由组件默认规则决定。
   */
  showHeader?: boolean;
  /**
   * 外观类型，card 为卡片，banner 为横幅。
   */
  decoration?: 'card' | 'banner';
  /**
   * 模板副标题；空字符串显式隐藏，省略时按槽位生成默认文案。
   */
  subTitle?: string;
}
/**
 * 大屏中的模板实例，保存摆放位置、对象指派和不影响其他实例的私有配置。
 */
export interface ComponentInstance {
  /**
   * 大屏内唯一实例标识。
   */
  instanceId: string;
  /**
   * 引用的组件模板资源 ID。
   */
  templateId: string;
  /**
   * 实例私有标题；省略时使用模板名称。
   */
  title?: string;
  /**
   * 实例副标题覆盖；空字符串显式隐藏，省略时继承模板。
   */
  subTitle?: string;
  /**
   * 相对大屏的逻辑几何信息及可选层级。
   */
  position: Geometry & {
    /**
     * 实例叠放层级，数字越大越靠前。
     */
    zIndex?: number;
  };
  /**
   * 实例标题栏开关；省略时继承模板。
   */
  showHeader?: boolean;
  /**
   * 模板槽位 ID 到具体实体 ID 的映射；没有对应键表示未指派。
   */
  slotBindings: Record<string, string>;
  /**
   * 模板槽位 ID 到具体数据来源（如 雷达1、遥测 等传感器站）的映射；省略或空字符串表示全部或自动来源。
   */
  slotSourceBindings?: Record<string, string>;
  /**
   * 模板控件 ID 到私有覆盖项的映射。
   */
  controlOverrides: Record<string, Override>;
}
/**
 * 可保存、导入导出的大屏配置；运行时实体数据和编辑历史不属于该配置。
 */
export interface ScreenConfig {
  /** 来源绑定语义版本；2 中空来源表示显式自动，缺失表示跟随曲线。 */
  bindingVersion?: 2;
  /**
   * 大屏资源唯一标识。
   */
  id: string;
  /**
   * 大屏显示名称。
   */
  name: string;
  /**
   * 大屏逻辑分辨率，单位像素。
   */
  resolution: {
    /**
     * 大屏逻辑宽度，单位像素。
     */
    width: number;
    /**
     * 大屏逻辑高度，单位像素。
     */
    height: number;
  };
  /**
   * 六位十六进制背景色，例如 #030B17。
   */
  background: string;
  /**
   * 大屏上的组件实例列表。
   */
  components: ComponentInstance[];
}
/**
 * 实体或全局数据包；同一结构也用于底账，底账可携带逐字段源时间。
 */
export interface Envelope {
  /**
   * 数据模式标识，与 Schema.type 对应。
   */
  type: string;
  /**
   * 实体模式必须提供实体 ID；全局模式省略。
   */
  id?: string;
  /**
   * 源数据时间戳，单位毫秒；不是客户端接收时间。
   */
  timestamp: number;
  /**
   * 本次提供的字段子集；null 覆盖为空，未出现的字段保留旧值。
   */
  data: Record<string, Scalar>;
  /**
   * 底账中的逐字段源时间戳，单位毫秒；由服务端生成，外部增量不能伪造。
   */
  fieldTimestamps?: Record<string, number>;
}
/**
 * 单个字段的历史样本，null 用于保留空值并中断曲线连接。
 */
export interface Point {
  /**
   * 样本的源时间戳，单位毫秒。
   */
  timestamp: number;
  /**
   * 有限数值或明确空值，不用 0 替代缺失。
   */
  value: number | null;
}
/**
 * 实体池中的一条记录，分别保存最新字段值、逐字段源时间和数值历史。
 */
export interface EntityRecord {
  /**
   * 按字段键保存的最新标量值。
   */
  data: Record<string, Scalar>;
  /**
   * 按字段键保存的最新源时间戳，单位毫秒。
   */
  timestamps: Record<string, number>;
  /**
   * 按字段键保存的历史点集；初始底账不生成历史。
   */
  history: Record<string, Point[]>;
}
/**
 * 控件显示层读取的解析结果，同时保留原始值和格式化后的文案。
 */
export interface ResolvedValue {
  /**
   * 格式化显示文本，缺失或无效值通常为 --。
   */
  value: string;
  /**
   * 未经格式化的标量；undefined 表示字段缺失。
   */
  raw: Scalar | undefined;
  /**
   * 最终采用的标签名称。
   */
  label: string;
  /**
   * 最终采用的单位文本。
   */
  unit: string;
  /**
   * 动态字段的源时间戳，单位毫秒；静态内容或无源时间时为 null。
   */
  timestamp: number | null;
  /**
   * 是否属于缺失、明确空值或无效数值。
   */
  empty: boolean;
  /**
   * 是否已超过当前控件的时效阈值。
   */
  stale: boolean;
}
