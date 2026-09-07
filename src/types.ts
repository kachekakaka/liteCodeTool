export type Scalar = string | number | boolean | null;
export type ControlType = 'text' | 'number' | 'time' | 'light' | 'table' | 'line' | 'image';
export interface Field { key: string; name: string; type: 'string' | 'number' | 'enum' | 'datetime'; unit?: string; precision?: number; options?: string[] }
export interface Schema { type: string; name: string; isEntity: boolean; idField?: string; fields: Field[] }
export interface Slot { id: string; label: string; schemaType: string }
export interface Geometry { x: number; y: number; w: number; h: number }
export interface Binding { target: 'slot' | 'global'; slotId?: string; schemaType?: string; field: string }
export interface Series { target?: 'slot' | 'global'; slotId?: string; schemaType?: string; field: string; color?: string; label?: string }
export interface ControlProps {
  sourceMode?: 'static' | 'dynamic'; staticValue?: Scalar;
  label?: string; labelMode?: 'auto' | 'custom'; unit?: string; unitMode?: 'auto' | 'custom'; precision?: number | null;
  lookbackMinutes?: number; gapSeconds?: number; staleSeconds?: number; staleEnabled?: boolean;
  series?: Series[]; columns?: string[]; schemaType?: string;
  filterField?: string; filterValue?: Scalar; pageSize?: number;
  colorRules?: { value: Scalar; color: string }[];
  imageType?: 'radar' | 'sonar' | 'image'; imageUrl?: string; alt?: string;
  clock?: boolean;
  variant?: 'standard' | 'kpi'; iconType?: 'vessel' | 'cargo' | 'fishing' | 'alert' | 'none'; autoPageSeconds?: number;
  xAxisMode?: 'time' | 'field'; xAxisField?: string; xAxisSlotId?: string; xAxisSchemaType?: string;
}
export interface Control { id: string; type: ControlType; style: Geometry & { fontSize?: number; color?: string }; props: ControlProps; binding?: Binding | null }
export interface Override { style?: Partial<Control['style']>; props?: Partial<ControlProps>; binding?: Binding | null }
export interface ComponentTemplate { id: string; name: string; category: string; layout: { width: number; height: number }; slots: Slot[]; controls: Control[]; showHeader?: boolean; decoration?: 'card' | 'banner'; subTitle?: string }
export interface ComponentInstance { instanceId: string; templateId: string; title?: string; subTitle?: string; position: Geometry & { zIndex?: number }; showHeader?: boolean; slotBindings: Record<string, string>; controlOverrides: Record<string, Override> }
export interface ScreenConfig { id: string; name: string; resolution: { width: number; height: number }; background: string; components: ComponentInstance[] }
export interface Envelope { type: string; id?: string; timestamp: number; data: Record<string, Scalar>; fieldTimestamps?: Record<string, number> }
export interface Point { timestamp: number; value: number | null }
export interface EntityRecord { data: Record<string, Scalar>; timestamps: Record<string, number>; history: Record<string, Point[]> }
export interface ResolvedValue { value: string; raw: Scalar | undefined; label: string; unit: string; timestamp: number | null; empty: boolean; stale: boolean }
