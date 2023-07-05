import {
	ROTATE_CORNER_TO_SELECTION_CORNER,
	RotateCorner,
	SelectionHandle,
	TAU,
	Vec2d,
	VecLike,
	rotateSelectionHandle,
} from '@tldraw/primitives'
import {
	Box2dModel,
	PageRecordType,
	TLBaseShape,
	TLShapeId,
	TLShapePartial,
	createShapeId,
} from '@tldraw/tlschema'
import { createTLStore } from '../config/createTLStore'
import { defaultTools } from '../config/defaultTools'
import { defineShape } from '../config/defineShape'
import { Editor, TLEditorOptions } from '../editor/Editor'
import { BaseBoxShapeUtil } from '../editor/shapes/BaseBoxShapeUtil'
import { TLContent } from '../editor/types/clipboard-types'
import {
	TLEventInfo,
	TLKeyboardEventInfo,
	TLPinchEventInfo,
	TLPointerEventInfo,
	TLWheelEventInfo,
} from '../editor/types/event-types'
import { RequiredKeys } from '../editor/types/misc-types'
import { shapesFromJsx } from './test-jsx'

jest.useFakeTimers()

if (typeof navigator !== 'undefined') {
	Object.assign(navigator, {
		clipboard: {
			write: () => {
				//noop
			},
		},
	})
}

// @ts-expect-error
window.ClipboardItem = class {}

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace jest {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		interface Matchers<R> {
			toCloselyMatchObject(value: any, precision?: number): void
		}
	}
}

type GeoShape = TLBaseShape<
	'geo',
	{
		w: number
		h: number
	}
>

class GeoShapeUtil extends BaseBoxShapeUtil<GeoShape> {
	getDefaultProps() {
		return {
			w: 100,
			h: 100,
		}
	}

	component() {
		return null
	}

	indicator() {
		return null
	}
}

const geoShape = defineShape('geo', {
	util: GeoShapeUtil,
})

/** @public */
export class TestEditor extends Editor {
	constructor(options: Partial<Omit<TLEditorOptions, 'store'>> = {}) {
		const elm = document.createElement('div')
		const { shapes = [geoShape], tools = [] } = options
		elm.tabIndex = 0
		super({
			shapes,
			tools: [...defaultTools, ...tools],
			store: createTLStore({ shapes }),
			getContainer: () => elm,
			...options,
		})

		// Pretty hacky way to mock the screen bounds
		this.elm = elm
		this.elm.getBoundingClientRect = () => this.bounds as DOMRect
		document.body.appendChild(this.elm)

		this.textMeasure.measureText = (
			textToMeasure: string,
			opts: {
				fontStyle: string
				fontWeight: string
				fontFamily: string
				fontSize: number
				lineHeight: number
				width: string
				maxWidth: string
			}
		): Box2dModel => {
			const breaks = textToMeasure.split('\n')
			const longest = breaks.reduce((acc, curr) => {
				return curr.length > acc.length ? curr : acc
			}, '')

			const w = longest.length * (opts.fontSize / 2)

			return {
				x: 0,
				y: 0,
				w: opts.width.includes('px') ? Math.max(w, +opts.width.replace('px', '')) : w,
				h:
					(opts.width.includes('px')
						? Math.ceil(w % +opts.width.replace('px', '')) + breaks.length
						: breaks.length) * opts.fontSize,
			}
		}

		this.textMeasure.measureTextSpans = (textToMeasure, opts) => {
			const box = this.textMeasure.measureText(textToMeasure, {
				...opts,
				width: `${opts.width}px`,
				padding: `${opts.padding}px`,
				maxWidth: 'auto',
			})
			return [{ box, text: textToMeasure }]
		}
	}

	elm: HTMLDivElement
	bounds = { x: 0, y: 0, top: 0, left: 0, width: 1080, height: 720, bottom: 720, right: 1080 }

	setScreenBounds(bounds: Box2dModel, center = false) {
		this.bounds.x = bounds.x
		this.bounds.y = bounds.y
		this.bounds.top = bounds.y
		this.bounds.left = bounds.x
		this.bounds.width = bounds.w
		this.bounds.height = bounds.h
		this.bounds.right = bounds.x + bounds.w
		this.bounds.bottom = bounds.y + bounds.h

		this.updateViewportScreenBounds(center)
		this.updateRenderingBounds()
		return this
	}

	clipboard = null as TLContent | null

	copy = (ids = this.selectedIds) => {
		if (ids.length > 0) {
			const content = this.getContent()
			if (content) {
				this.clipboard = content
			}
		}
		return this
	}

	cut = (ids = this.selectedIds) => {
		if (ids.length > 0) {
			const content = this.getContent()
			if (content) {
				this.clipboard = content
			}
			this.deleteShapes(ids)
		}
		return this
	}

	paste = (point?: VecLike) => {
		if (this.clipboard !== null) {
			const p = this.inputs.shiftKey ? this.inputs.currentPagePoint : point

			this.mark('pasting')
			this.putContent(this.clipboard, {
				point: p,
				select: true,
			})
		}
		return this
	}

	/**
	 * If you need to trigger a double click, you can either mock the implementation of one of these
	 * methods, or call mockRestore() to restore the actual implementation (e.g.
	 * _transformPointerDownSpy.mockRestore())
	 */
	_transformPointerDownSpy = jest
		.spyOn(this._clickManager, 'transformPointerDownEvent')
		.mockImplementation((info) => {
			return info
		})
	_transformPointerUpSpy = jest
		.spyOn(this._clickManager, 'transformPointerDownEvent')
		.mockImplementation((info) => {
			return info
		})

	testShapeID(id: string) {
		return createShapeId(id)
	}
	testPageID(id: string) {
		return PageRecordType.createId(id)
	}

	expectToBeIn = (path: string) => {
		expect(this.root.current.value!.path.value).toBe(path)
		return this
	}

	expectPathToBe = (path: string) => {
		expect(this.root.path.value).toBe(path)
		return this
	}

	expectCameraToBe(x: number, y: number, z: number) {
		const camera = this.camera

		expect({
			x: +camera.x.toFixed(2),
			y: +camera.y.toFixed(2),
			z: +camera.z.toFixed(2),
		}).toCloselyMatchObject({ x, y, z })
	}

	expectShapeToMatch = (...model: RequiredKeys<TLShapePartial, 'id'>[]) => {
		model.forEach((model) => {
			const shape = this.getShapeById(model.id)!
			const next = { ...shape, ...model }
			expect(shape).toCloselyMatchObject(next)
		})
		return this
	}

	/* --------------------- Inputs --------------------- */

	protected getInfo = <T extends TLEventInfo>(info: string | T): T => {
		return typeof info === 'string'
			? ({
					target: 'shape',
					shape: this.getShapeById(info as any),
			  } as T)
			: info
	}

	protected getPointerEventInfo = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: Partial<TLPointerEventInfo> | TLShapeId,
		modifiers?: EventModifiers
	): TLPointerEventInfo => {
		if (typeof options === 'string') {
			options = { target: 'shape', shape: this.getShapeById(options) }
		} else if (options === undefined) {
			options = { target: 'canvas' }
		}
		return {
			name: 'pointer_down',
			type: 'pointer',
			pointerId: 1,
			shiftKey: this.inputs.shiftKey,
			ctrlKey: this.inputs.ctrlKey,
			altKey: this.inputs.altKey,
			point: { x, y, z: null },
			button: 0,
			isPen: false,
			...options,
			...modifiers,
		} as TLPointerEventInfo
	}

	protected getKeyboardEventInfo = (
		key: string,
		name: TLKeyboardEventInfo['name'],
		options = {} as Partial<Exclude<TLKeyboardEventInfo, 'point'>>
	): TLKeyboardEventInfo => {
		return {
			shiftKey: key === 'Shift',
			ctrlKey: key === 'Control' || key === 'Meta',
			altKey: key === 'Alt',
			...options,
			name,
			code:
				key === 'Shift'
					? 'ShiftLeft'
					: key === 'Alt'
					? 'AltLeft'
					: key === 'Control' || key === 'Meta'
					? 'CtrlLeft'
					: key === ' '
					? 'Space'
					: key === 'Enter' ||
					  key === 'ArrowRight' ||
					  key === 'ArrowLeft' ||
					  key === 'ArrowUp' ||
					  key === 'ArrowDown'
					? key
					: 'Key' + key[0].toUpperCase() + key.slice(1),
			type: 'keyboard',
			key,
		}
	}

	/* ------------------ Input Events ------------------ */

	pointerMove = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			name: 'pointer_move',
		})
		return this
	}

	pointerDown = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			name: 'pointer_down',
		})
		return this
	}

	pointerUp = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			name: 'pointer_up',
		})
		return this
	}

	pointerEnter = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			name: 'pointer_enter',
		})
		return this
	}

	pointerLeave = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			name: 'pointer_leave',
		})
		return this
	}

	click = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.pointerDown(x, y, options, modifiers)
		this.pointerUp(x, y, options, modifiers)
		return this
	}

	doubleClick = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		options?: PointerEventInit,
		modifiers?: EventModifiers
	) => {
		this.pointerDown(x, y, options, modifiers)
		this.pointerUp(x, y, options, modifiers)
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			type: 'click',
			name: 'double_click',
			phase: 'down',
		})
		this.dispatch({
			...this.getPointerEventInfo(x, y, options, modifiers),
			type: 'click',
			name: 'double_click',
			phase: 'up',
		})
		return this
	}

	keyDown = (key: string, options = {} as Partial<Exclude<TLKeyboardEventInfo, 'key'>>) => {
		this.dispatch({ ...this.getKeyboardEventInfo(key, 'key_down', options) })
		return this
	}

	keyRepeat = (key: string, options = {} as Partial<Exclude<TLKeyboardEventInfo, 'key'>>) => {
		this.dispatch({ ...this.getKeyboardEventInfo(key, 'key_repeat', options) })
		return this
	}

	keyUp = (key: string, options = {} as Partial<Omit<TLKeyboardEventInfo, 'key'>>) => {
		this.dispatch({
			...this.getKeyboardEventInfo(key, 'key_up', {
				shiftKey: this.inputs.shiftKey && key !== 'Shift',
				ctrlKey: this.inputs.ctrlKey && !(key === 'Control' || key === 'Meta'),
				altKey: this.inputs.altKey && key !== 'Alt',
				...options,
			}),
		})
		return this
	}

	wheel = (dx: number, dy: number, options = {} as Partial<Omit<TLWheelEventInfo, 'delta'>>) => {
		this.dispatch({
			type: 'wheel',
			name: 'wheel',
			shiftKey: this.inputs.shiftKey,
			ctrlKey: this.inputs.ctrlKey,
			altKey: this.inputs.altKey,
			...options,
			delta: { x: dx, y: dy },
		})
		return this
	}

	pinchStart = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		z: number,
		dx: number,
		dy: number,
		dz: number,
		options = {} as Partial<Omit<TLPinchEventInfo, 'point' | 'delta' | 'offset'>>
	) => {
		this.dispatch({
			type: 'pinch',
			name: 'pinch_start',
			shiftKey: this.inputs.shiftKey,
			ctrlKey: this.inputs.ctrlKey,
			altKey: this.inputs.altKey,
			...options,
			point: { x, y, z },
			delta: { x: dx, y: dy, z: dz },
		})
		return this
	}

	pinchTo = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		z: number,
		dx: number,
		dy: number,
		dz: number,
		options = {} as Partial<Omit<TLPinchEventInfo, 'point' | 'delta' | 'offset'>>
	) => {
		this.dispatch({
			type: 'pinch',
			name: 'pinch_start',
			shiftKey: this.inputs.shiftKey,
			ctrlKey: this.inputs.ctrlKey,
			altKey: this.inputs.altKey,
			...options,
			point: { x, y, z },
			delta: { x: dx, y: dy, z: dz },
		})
		return this
	}

	pinchEnd = (
		x = this.inputs.currentScreenPoint.x,
		y = this.inputs.currentScreenPoint.y,
		z: number,
		dx: number,
		dy: number,
		dz: number,
		options = {} as Partial<Omit<TLPinchEventInfo, 'point' | 'delta' | 'offset'>>
	) => {
		this.dispatch({
			type: 'pinch',
			name: 'pinch_end',
			shiftKey: this.inputs.shiftKey,
			ctrlKey: this.inputs.ctrlKey,
			altKey: this.inputs.altKey,
			...options,
			point: { x, y, z },
			delta: { x: dx, y: dy, z: dz },
		})
		return this
	}
	/* ------ Interaction Helpers ------ */

	rotateSelection(
		angleRadians: number,
		{
			handle = 'top_left_rotate',
			shiftKey = false,
		}: { handle?: RotateCorner; shiftKey?: boolean } = {}
	) {
		if (this.selectedIds.length === 0) {
			throw new Error('No selection')
		}

		this.setSelectedTool('select')

		const handlePoint = this.selectionBounds!.getHandlePoint(
			ROTATE_CORNER_TO_SELECTION_CORNER[handle]
		)
			.clone()
			.rotWith(this.selectionBounds!.point, this.selectionRotation)

		const targetHandlePoint = Vec2d.RotWith(handlePoint, this.selectionPageCenter!, angleRadians)

		this.pointerDown(handlePoint.x, handlePoint.y, { target: 'selection', handle })
		this.pointerMove(targetHandlePoint.x, targetHandlePoint.y, { shiftKey })
		this.pointerUp()
		return this
	}

	translateSelection(dx: number, dy: number, options?: Partial<TLPointerEventInfo>) {
		if (this.selectedIds.length === 0) {
			throw new Error('No selection')
		}
		this.setSelectedTool('select')

		const center = this.selectionPageCenter!

		this.pointerDown(center.x, center.y, this.selectedIds[0])
		const numSteps = 10
		for (let i = 1; i < numSteps; i++) {
			this.pointerMove(center.x + (i * dx) / numSteps, center.y + (i * dy) / numSteps, options)
		}
		this.pointerUp(center.x + dx, center.y + dy, options)
		return this
	}

	resizeSelection(
		{ scaleX = 1, scaleY = 1 },
		handle: SelectionHandle,
		options?: Partial<TLPointerEventInfo>
	) {
		if (this.selectedIds.length === 0) {
			throw new Error('No selection')
		}
		this.setSelectedTool('select')
		const bounds = this.selectionBounds!
		const preRotationHandlePoint = bounds.getHandlePoint(handle)

		const preRotationScaleOriginPoint = options?.altKey
			? bounds.center
			: bounds.getHandlePoint(rotateSelectionHandle(handle, Math.PI))

		const preRotationTargetHandlePoint = Vec2d.Add(
			Vec2d.Sub(preRotationHandlePoint, preRotationScaleOriginPoint).mulV({ x: scaleX, y: scaleY }),
			preRotationScaleOriginPoint
		)

		const handlePoint = Vec2d.RotWith(preRotationHandlePoint, bounds.point, this.selectionRotation)
		const targetHandlePoint = Vec2d.RotWith(
			preRotationTargetHandlePoint,
			bounds.point,
			this.selectionRotation
		)

		this.pointerDown(
			handlePoint.x,
			handlePoint.y,
			{
				target: 'selection',
				handle,
			},
			options
		)
		this.pointerMove(targetHandlePoint.x, targetHandlePoint.y, options)
		this.pointerUp(targetHandlePoint.x, targetHandlePoint.y, options)
		return this
	}

	createShapesFromJsx(shapesJsx: JSX.Element | JSX.Element[]): Record<string, TLShapeId> {
		const { shapes, ids } = shapesFromJsx(shapesJsx)
		this.createShapes(shapes)
		return ids
	}

	static CreateShapeId(id?: string) {
		return id ? createShapeId(id) : createShapeId()
	}
}

export const defaultShapesIds = {
	box1: createShapeId('box1'),
	box2: createShapeId('box2'),
	ellipse1: createShapeId('ellipse1'),
}

export const createDefaultShapes = (): TLShapePartial[] => [
	{
		id: defaultShapesIds.box1,
		type: 'geo',
		x: 100,
		y: 100,
		props: {
			w: 100,
			h: 100,
			geo: 'rectangle',
		},
	},
	{
		id: defaultShapesIds.box2,
		type: 'geo',
		x: 200,
		y: 200,
		rotation: TAU / 2,
		props: {
			w: 100,
			h: 100,
			color: 'black',
			fill: 'none',
			dash: 'draw',
			size: 'm',
			geo: 'rectangle',
		},
	},
	{
		id: defaultShapesIds.ellipse1,
		type: 'geo',
		parentId: defaultShapesIds.box2,
		x: 200,
		y: 200,
		props: {
			w: 50,
			h: 50,
			color: 'black',
			fill: 'none',
			dash: 'draw',
			size: 'm',
			geo: 'ellipse',
		},
	},
]

type PointerEventInit = Partial<TLPointerEventInfo> | TLShapeId
type EventModifiers = Partial<Pick<TLPointerEventInfo, 'shiftKey' | 'ctrlKey' | 'altKey'>>
