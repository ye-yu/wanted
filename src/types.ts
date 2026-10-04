export type NoArgsConstructor<T> = { new(): T }
export type AnyArgsConstructor<T> = { new(...args: any): T }

abstract class Wantable {
  abstract want(): void
}
export type WantableConstructor<T = unknown> = abstract new () => (Wantable & T)

abstract class WantableAsync {
  abstract wantAsync(): Promise<void>
}
export type WantableAsyncConstructor<T = unknown> = abstract new () => (WantableAsync & T)
