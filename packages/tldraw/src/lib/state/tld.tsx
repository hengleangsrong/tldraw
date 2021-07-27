/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Static utilities that operate on the state machine's data object

import { TLBinding, TLBounds, TLPage, Utils, Vec } from '@tldraw/core'
import { getShapeUtils, TLDrawShape } from '../shapes'
import { Data } from '../types'

export class TLD {
  static getParentId(data: Data, id: string) {
    const shape = data.page.shapes[id]
    return shape.parentId
  }

  static getPointedId(data: Data, id: string): string {
    const shape = data.page.shapes[id]
    if (!shape) return id

    return shape.parentId === data.pageState.currentParentId || shape.parentId === data.page.id
      ? id
      : this.getPointedId(data, shape.parentId)
  }

  static getDrilledPointedId(data: Data, id: string): string {
    const shape = data.page.shapes[id]
    const { currentParentId, pointedId } = data.pageState

    return shape.parentId === data.page.id || shape.parentId === pointedId || shape.parentId === currentParentId
      ? id
      : this.getDrilledPointedId(data, shape.parentId)
  }

  static getTopParentId(data: Data, id: string): string {
    const shape = data.page.shapes[id]

    if (shape.parentId === shape.id) {
      throw Error(`Shape has the same id as its parent! ${shape.id}`)
    }

    return shape.parentId === data.page.id || shape.parentId === data.pageState.currentParentId
      ? id
      : this.getTopParentId(data, shape.parentId)
  }

  // Get an array of a shape id and its descendant shapes' ids
  static getDocumentBranch(data: Data, id: string): string[] {
    const shape = data.page.shapes[id]

    if (shape.children === undefined) return [id]

    return [id, ...shape.children.flatMap((childId) => this.getDocumentBranch(data, childId))]
  }

  // Get a deep array of unproxied shapes and their descendants
  static getSelectedBranchSnapshot<K>(data: Data, fn: (shape: TLDrawShape) => K): ({ id: string } & K)[]
  static getSelectedBranchSnapshot(data: Data): TLDrawShape[]
  static getSelectedBranchSnapshot<K>(data: Data, fn?: (shape: TLDrawShape) => K): (TLDrawShape | K)[] {
    const page = this.getPage(data)

    const copies = this.getSelectedIds(data)
      .flatMap((id) => this.getDocumentBranch(data, id).map((id) => page.shapes[id]))
      .filter((shape) => !shape.isLocked)
      .map(Utils.deepClone)

    if (fn !== undefined) {
      return copies.map((shape) => ({ id: shape.id, ...fn(shape) }))
    }

    return copies
  }

  // Get a shallow array of unproxied shapes
  static getSelectedShapeSnapshot(data: Data): TLDrawShape[]
  static getSelectedShapeSnapshot<K>(data: Data, fn?: (shape: TLDrawShape) => K): ({ id: string } & K)[]
  static getSelectedShapeSnapshot<K>(data: Data, fn?: (shape: TLDrawShape) => K): (TLDrawShape | K)[] {
    const copies = this.getSelectedShapes(data)
      .filter((shape) => !shape.isLocked)
      .map(Utils.deepClone)

    if (fn !== undefined) {
      return copies.map((shape) => ({ id: shape.id, ...fn(shape) }))
    }

    return copies
  }

  static getChildIndexAbove(data: Data, id: string): number {
    const page = this.getPage(data)

    const shape = page.shapes[id]

    const siblings = Object.values(page.shapes)
      .filter(({ parentId }) => parentId === shape.parentId)
      .sort((a, b) => a.childIndex - b.childIndex)

    const index = siblings.indexOf(shape)

    const nextSibling = siblings[index + 1]

    if (!nextSibling) return shape.childIndex + 1

    let nextIndex = (shape.childIndex + nextSibling.childIndex) / 2

    if (nextIndex === nextSibling.childIndex) {
      this.forceIntegerChildIndices(siblings)
      nextIndex = (shape.childIndex + nextSibling.childIndex) / 2
    }

    return nextIndex
  }

  static getTopChildIndex(data: Data, parent: TLDrawShape | TLPage<TLDrawShape>): number {
    const page = this.getPage(data)

    // If the parent is a shape, return either 1 (if no other shapes) or the
    // highest sorted child index + 1.
    if ('shapes' in parent) {
      const children = Object.values(parent.shapes)

      if (children.length === 0) return 1

      return children.sort((a, b) => b.childIndex - a.childIndex)[0].childIndex + 1
    }

    // If the shape is a regular shape that can accept children, return either
    // 1 (if no other children) or the highest sorted child index + 1.
    this.assertParentShape(parent)

    if (parent.children.length === 0) return 1

    return parent.children.map((id) => page.shapes[id]).sort((a, b) => b.childIndex - a.childIndex)[0].childIndex + 1
  }

  static assertParentShape(shape: TLDrawShape): asserts shape is TLDrawShape & { children: string[] } {
    if (!('children' in shape)) {
      throw new Error(`That shape was not a parent (it was a ${shape.type}).`)
    }
  }

  // Force all shapes on the page to have integer child indices.
  static forceIntegerChildIndices(shapes: TLDrawShape[]): void {
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]
      this.getShapeUtils(shape).setProperty(shape, 'childIndex', i + 1)
    }
  }

  static updateParents(data: Data, changedShapeIds: string[]): void {
    if (changedShapeIds.length === 0) return

    const { shapes } = this.getPage(data)

    const parentToUpdateIds = Array.from(new Set(changedShapeIds.map((id) => shapes[id].parentId).values())).filter(
      (id) => id !== data.page.id,
    )

    for (const parentId of parentToUpdateIds) {
      const parent = shapes[parentId]

      if (!parent.children) {
        throw Error('A shape is parented to a shape without a children array.')
      }

      this.getShapeUtils(parent).onChildrenChange(
        parent,
        parent.children.map((id) => shapes[id]),
      )

      shapes[parentId] = { ...parent }
    }

    this.updateParents(data, parentToUpdateIds)
  }

  static deleteShapes(
    data: Data,
    shapeIds: string[] | TLDrawShape[],
    shapesDeleted: TLDrawShape[] = [],
  ): TLDrawShape[] {
    const ids =
      typeof shapeIds[0] === 'string' ? (shapeIds as string[]) : (shapeIds as TLDrawShape[]).map((shape) => shape.id)

    const parentsToDelete: string[] = []

    const page = this.getPage(data)

    const parentIds = new Set(ids.map((id) => page.shapes[id].parentId))

    // Delete shapes
    ids.forEach((id) => {
      shapesDeleted.push(Utils.deepClone(page.shapes[id]))
      delete page.shapes[id]
    })

    // Update parents
    parentIds.forEach((id) => {
      const parent = page.shapes[id]

      // The parent was either deleted or a is a page.
      if (!parent) return

      const utils = this.getShapeUtils(parent)

      // Remove deleted ids from the parent's children and update the parent
      utils
        .setProperty(
          parent,
          'children',
          parent.children!.filter((childId) => !ids.includes(childId)),
        )
        .onChildrenChange(
          parent,
          parent.children!.map((id) => page.shapes[id]),
        )

      if (utils.shouldDelete(parent)) {
        // If the parent decides it should delete, then we need to reparent
        // the parent's remaining children to the parent's parent, and
        // assign them correct child indices, and then delete the parent on
        // the next recursive step.

        const nextIndex = this.getChildIndexAbove(data, parent.id)

        const len = parent.children!.length

        // Reparent the children and assign them new child indices
        parent.children!.forEach((childId, i) => {
          const child = this.getShape(data, childId)

          this.getShapeUtils(child)
            .setProperty(child, 'parentId', parent.parentId)
            .setProperty(child, 'childIndex', Utils.lerp(parent.childIndex, nextIndex, i / len))
        })

        if (parent.parentId !== page.id) {
          // If the parent is not a page, then we add the parent's children
          // to the parent's parent shape before emptying that array. If the
          // parent is a page, then we don't need to do this step.
          // TODO: Consider adding explicit children array to page shapes.
          const grandParent = page.shapes[parent.parentId]

          this.getShapeUtils(grandParent)
            .setProperty(grandParent, 'children', [...parent.children!])
            .onChildrenChange(
              grandParent,
              grandParent.children!.map((id) => page.shapes[id]),
            )
        }

        // Empty the parent's children array and delete the parent on the next
        // iteration step.
        this.getShapeUtils(parent).setProperty(parent, 'children', [])

        parentsToDelete.push(parent.id)
      }
    })

    if (parentsToDelete.length > 0) {
      return this.deleteShapes(data, parentsToDelete, shapesDeleted)
    }

    return shapesDeleted
  }

  static getShapeUtils(shape: TLDrawShape) {
    return getShapeUtils(shape)
  }

  static getSelectedShapes(data: Data) {
    return data.pageState.selectedIds.map((id) => data.page.shapes[id])
  }

  static screenToWorld(data: Data, point: number[]) {
    const { camera } = data.pageState

    return Vec.sub(Vec.div(point, camera.zoom), camera.point)
  }

  static getViewport(data: Data): TLBounds {
    const [minX, minY] = this.screenToWorld(data, [0, 0])
    const [maxX, maxY] = this.screenToWorld(data, [window.innerWidth, window.innerHeight])

    return {
      minX,
      minY,
      maxX,
      maxY,
      height: maxX - minX,
      width: maxY - minY,
    }
  }

  static getCameraZoom(zoom: number) {
    return Utils.clamp(zoom, 0.1, 5)
  }

  static getCurrentCamera(data: Data) {
    return data.pageState.camera
  }

  static getPage(data: Data) {
    return data.page
  }

  static getPageState(data: Data) {
    return data.pageState
  }

  static getSelectedIds(data: Data) {
    return data.pageState.selectedIds
  }

  static setSelectedIds(data: Data, ids: string[]) {
    data.pageState.selectedIds = ids
  }

  static deselectAll(data: Data) {
    this.setSelectedIds(data, [])
  }

  static getShapes(data: Data) {
    return Object.values(data.page.shapes)
  }

  static getCamera(data: Data) {
    return data.pageState.camera
  }

  static getShape<T extends TLDrawShape = TLDrawShape>(data: Data, shapeId: string): T {
    return data.page.shapes[shapeId] as T
  }

  static getBinding(data: Data, id: string): TLBinding {
    return this.getPage(data).bindings[id]
  }
}
