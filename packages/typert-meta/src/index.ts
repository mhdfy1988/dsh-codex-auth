/**
 * Build-time type-identity bridge for the published Typert generator.
 *
 * The generator currently recognizes its marker symbols only when their
 * declarations belong to a referenced workspace package named
 * `@deepseek-ai/dsh-typert-protocol`. Host JavaScript keeps the original bare
 * import and therefore executes the official installed package; this private
 * project contributes no runtime file to the distributed bundle.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

/** Options for the official Service-to-Gateway binding. */
export interface TypertGatewayBindingOptions {
  /** Wire namespace; defaults to the Cordis service key. */
  readonly namespace?: string
}

/** Visible declaration that one Service participates in Typert Gateway export. */
export interface TypertGatewayBinding<BoundService extends object = object> {
  readonly service: BoundService
  readonly serviceKey: string
  readonly namespace: string
}

type RemoteMethodDecorator = <This extends object, Args extends unknown[], Result>(
  method: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
) => void

/** Compile-time declaration of the official Cordis Remote Service base. */
export declare abstract class TypertRemoteService<out T = never> extends Service<T> {
  readonly typertRemote: TypertGatewayBinding<this>
  protected constructor(ctx: Context, serviceKey: string, options?: TypertGatewayBindingOptions)
}

/** Compile-time declaration of the official direct Remote decorator. */
export declare function Remote<This extends object, Args extends unknown[], Result>(
  method: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
): void

/** Compile-time declaration of the official named Remote decorator. */
export declare function Remote(exportName: string): RemoteMethodDecorator
