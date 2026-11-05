/** Feature classes shared by the preprocessors and the renderer (pack indices). */

/** Ground polygons, in paint order. */
export const POLY_CLASSES = [
  'industrial',
  'park',
  'cemetery',
  'forest',
  'wetland',
  'sand',
  'pitch',
  'track',
  'plaza',
  'parking',
  'aeroway',
  'water',
  'pool',
  'river',
] as const
export type PolyClass = (typeof POLY_CLASSES)[number]

/** Line features (roads, rails, waterways). */
export const LINE_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'residential',
  'service',
  'pedestrian',
  'footway',
  'cycleway',
  'rail',
  'stream',
  'canal',
  'river',
  'runway',
] as const
export type LineClass = (typeof LINE_CLASSES)[number]

export const TREE_KINDS = [
  'broadleaf',
  'evergreen',
  'conifer',
  'palm',
  'jacaranda',
  'tipa',
  'plane',
  'pink',
] as const
