// open spec: add-conversation-token-usage-tab
// tdesign-vue-next/chat 间接拉取的 d3-* 模块没有 .d.ts。
// 不引入 @types/d3-scale（避免新依赖）；这里用声明文件兜底。
declare module 'd3-scale' {
  export function scaleLinear<Range = number, Output = number, Unknown = never>(): LinearScale<Range, Output, Unknown>
  export function scaleBand<Domain extends { toString(): string } = string>(): BandScale<Domain>
  export interface LinearScale<Range, Output, Unknown> {
    (value: number): Output
    domain(domain: number[]): this
    range(range: Range[]): this
    nice(count?: number): this
    ticks(count?: number): number[]
    tickFormat(count?: number, specifier?: string): (v: number) => string
  }
  export interface BandScale<Domain> {
    (value: Domain): number | undefined
    domain(domain: Domain[]): this
    range(range: number[]): this
    padding(value: number): this
    bandwidth(): number
  }
}