let editor: TestEditor

function asPlainObject(styles: ReadonlySharedStyleMap | null) {
	if (!styles) return null
	const object: Record<string, SharedStyle<unknown>> = {}
	for (const [key, value] of styles) {
		object[key.id] = value
	}
	return object
}

beforeEach(() => {
	editor = new TestEditor()
	editor.createShapes(createDefaultShapes())
	editor.reparentShapesById([defaultShapesIds.ellipse1], editor.currentPageId)
})

describe('Editor.styles', () => {
	it('should return empty if nothing is selected', () => {
		editor.selectNone()
		expect(asPlainObject(editor.sharedStyles)).toStrictEqual({})
	})

	it('should return styles for a single shape', () => {
		editor.select(defaultShapesIds.box1)
		expect(asPlainObject(editor.sharedStyles)).toStrictEqual({
			'tldraw:horizontalAlign': { type: 'shared', value: 'middle' },
			'tldraw:labelColor': { type: 'shared', value: 'black' },
			'tldraw:color': { type: 'shared', value: 'black' },
			'tldraw:dash': { type: 'shared', value: 'draw' },
			'tldraw:fill': { type: 'shared', value: 'none' },
			'tldraw:size': { type: 'shared', value: 'm' },
			'tldraw:font': { type: 'shared', value: 'draw' },
			'tldraw:geo': { type: 'shared', value: 'rectangle' },
			'tldraw:verticalAlign': { type: 'shared', value: 'middle' },
		})
	})

	it('should return styles for two matching shapes', () => {
		editor.select(defaultShapesIds.box1, defaultShapesIds.box2)
		expect(asPlainObject(editor.sharedStyles)).toStrictEqual({
			'tldraw:horizontalAlign': { type: 'shared', value: 'middle' },
			'tldraw:labelColor': { type: 'shared', value: 'black' },
			'tldraw:color': { type: 'shared', value: 'black' },
			'tldraw:dash': { type: 'shared', value: 'draw' },
			'tldraw:fill': { type: 'shared', value: 'none' },
			'tldraw:size': { type: 'shared', value: 'm' },
			'tldraw:font': { type: 'shared', value: 'draw' },
			'tldraw:geo': { type: 'shared', value: 'rectangle' },
			'tldraw:verticalAlign': { type: 'shared', value: 'middle' },
		})
	})

	it('should return mixed styles for shapes that have mixed values', () => {
		editor.updateShapes([
			{
				id: defaultShapesIds.box1,
				type: 'geo',
				props: { h: 200, w: 200, color: 'red', dash: 'solid' },
			},
		])

		editor.select(defaultShapesIds.box1, defaultShapesIds.box2)

		expect(asPlainObject(editor.sharedStyles)).toStrictEqual({
			'tldraw:horizontalAlign': { type: 'shared', value: 'middle' },
			'tldraw:labelColor': { type: 'shared', value: 'black' },
			'tldraw:color': { type: 'mixed' },
			'tldraw:dash': { type: 'mixed' },
			'tldraw:fill': { type: 'shared', value: 'none' },
			'tldraw:size': { type: 'shared', value: 'm' },
			'tldraw:font': { type: 'shared', value: 'draw' },
			'tldraw:geo': { type: 'shared', value: 'rectangle' },
			'tldraw:verticalAlign': { type: 'shared', value: 'middle' },
		})
	})

	it('should return mixed for all mixed styles', () => {
		editor.updateShapes([
			{
				id: defaultShapesIds.box1,
				type: 'geo',
				props: { h: 200, w: 200, color: 'red', dash: 'solid' },
			},
			{
				id: defaultShapesIds.box2,
				type: 'geo',
				props: { size: 'l', fill: 'pattern', font: 'mono' },
			},
			{
				id: defaultShapesIds.ellipse1,
				type: 'geo',
				props: {
					align: 'start',
					text: 'hello world this is a long sentence that should wrap',
					w: 100,
					url: 'https://aol.com',
					verticalAlign: 'start',
				},
			},
		])

		editor.selectAll()

		expect(asPlainObject(editor.sharedStyles)).toStrictEqual({
			'tldraw:color': { type: 'mixed' },
			'tldraw:dash': { type: 'mixed' },
			'tldraw:fill': { type: 'mixed' },
			'tldraw:font': { type: 'mixed' },
			'tldraw:geo': { type: 'mixed' },
			'tldraw:horizontalAlign': { type: 'mixed' },
			'tldraw:labelColor': { type: 'shared', value: 'black' },
			'tldraw:size': { type: 'mixed' },
			'tldraw:verticalAlign': { type: 'mixed' },
		})
	})

	it('should return the same styles object if nothing relevant changes', () => {
		editor.select(defaultShapesIds.box1, defaultShapesIds.box2)
		const initialStyles = editor.sharedStyles

		// update position of one of the shapes - not a style prop, so maps to same styles
		editor.updateShapes([
			{
				id: defaultShapesIds.box1,
				type: 'geo',
				x: 1000,
				y: 1000,
			},
		])

		expect(editor.sharedStyles).toBe(initialStyles)
	})
})

describe('Editor.setStyle', () => {
	it('should set style for selected shapes', () => {
		const ids = editor.createShapesFromJsx([
			<TL.geo ref="A" x={0} y={0} color="blue" />,
			<TL.geo ref="B" x={0} y={0} color="green" />,
		])

		editor.setSelectedIds([ids.A, ids.B])
		editor.setStyle(DefaultColorStyle, 'red')

		expect(editor.getShapeById<TLGeoShape>(ids.A)!.props.color).toBe('red')
		expect(editor.getShapeById<TLGeoShape>(ids.B)!.props.color).toBe('red')
	})

	it('should traverse into groups and set styles in their children', () => {
		const ids = editor.createShapesFromJsx([
			<TL.geo ref="boxA" x={0} y={0} />,
			<TL.group ref="groupA" x={0} y={0}>
				<TL.geo ref="boxB" x={0} y={0} />
				<TL.group ref="groupB" x={0} y={0}>
					<TL.geo ref="boxC" x={0} y={0} />
					<TL.geo ref="boxD" x={0} y={0} />
				</TL.group>
			</TL.group>,
		])

		editor.setSelectedIds([ids.groupA])
		editor.setStyle(DefaultColorStyle, 'red')

		// a wasn't selected...
		expect(editor.getShapeById<TLGeoShape>(ids.boxA)!.props.color).toBe('black')

		// b, c, & d were within a selected group...
		expect(editor.getShapeById<TLGeoShape>(ids.boxB)!.props.color).toBe('red')
		expect(editor.getShapeById<TLGeoShape>(ids.boxC)!.props.color).toBe('red')
		expect(editor.getShapeById<TLGeoShape>(ids.boxD)!.props.color).toBe('red')

		// groups get skipped
		expect(editor.getShapeById<TLGroupShape>(ids.groupA)!.props).not.toHaveProperty('color')
		expect(editor.getShapeById<TLGroupShape>(ids.groupB)!.props).not.toHaveProperty('color')
	})

	it('stores styles on stylesForNextShape', () => {
		editor.setStyle(DefaultColorStyle, 'red')
		expect(editor.instanceState.stylesForNextShape[DefaultColorStyle.id]).toBe('red')
		editor.setStyle(DefaultColorStyle, 'green')
		expect(editor.instanceState.stylesForNextShape[DefaultColorStyle.id]).toBe('green')
	})
})
