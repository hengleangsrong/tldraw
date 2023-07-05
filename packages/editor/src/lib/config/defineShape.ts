import { Migrations } from '@tldraw/store'
import { ShapeProps, TLBaseShape, TLUnknownShape } from '@tldraw/tlschema'
import { TLShapeUtilConstructor } from '../editor/shapes/ShapeUtil'
import { TLStateNodeConstructor } from '../editor/tools/StateNode'

export type ShapeFromUtilConstructor<T extends TLShapeUtilConstructor<any, any>> = Parameters<
	InstanceType<T>['component']
>[0]

/** @public */
export type TLShapeInfo<
	Shape extends TLUnknownShape = TLUnknownShape,
	Util extends TLShapeUtilConstructor<Shape> = TLShapeUtilConstructor<Shape>
	// Shape extends TLUnknownShape = TLUnknownShape,
	// Util extends ShapeUtil<Shape> = ShapeUtil<Shape>
> = {
	type: ShapeFromUtilConstructor<Util>['type']
	util: Util
	props?: ShapeProps<ShapeFromUtilConstructor<Util>>
	migrations?: Migrations
	tool?: TLStateNodeConstructor
}

/** @public */
export type AnyTLShapeInfo = TLShapeInfo<
	TLBaseShape<any, any>,
	TLShapeUtilConstructor<TLBaseShape<any, any>>
>

/** @public */
export function defineShape<Util extends TLShapeUtilConstructor<any>>(
	type: ShapeFromUtilConstructor<Util>['type'],
	opts: {
		util: Util
		props?: ShapeProps<ShapeFromUtilConstructor<Util>>
		migrations?: Migrations
		tool?: TLStateNodeConstructor
	}
): TLShapeInfo<ShapeFromUtilConstructor<Util>, Util> {
	return { type, ...opts }
}
