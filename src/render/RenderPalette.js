export const RENDER_PALETTE = {
  oceanDeep: 0x071f33,
  oceanMid: 0x0c3552,
  oceanBright: 0x1e5f84,
  laneFill: 0x537387,
  coastFill: 0xcab48a,
  coastEdge: 0x7d613b,
  fishingFill: 0x54c790,
  fishingStroke: 0x7af2b5,
  border: 0xf07171,
  borderGlow: 0xffb89d,
  patrol: 0xa3e7ff,
  patrolGlow: 0x2cd6ff,
  friendly: 0x56f3da,
  neutral: 0x80c8df,
  suspicious: 0xf6c562,
  target: 0xff9f5b,
  enemy: 0xff6b6b,
  cargo: 0xa9c7d6,
  text: 0xeaf8ff,
  textShadow: 0x082033,
};

export function getEntityColor(entity) {
  if (entity.type === 'friendly') {
    return RENDER_PALETTE.friendly;
  }

  if (entity.type === 'cargo') {
    return RENDER_PALETTE.cargo;
  }

  if (entity.type === 'threat') {
    if (entity.state === 'collision') {
      return RENDER_PALETTE.enemy;
    }
  }

  if (entity.classification === 'enemy') {
    return RENDER_PALETTE.enemy;
  }

  if (entity.classification === 'target') {
    return RENDER_PALETTE.target;
  }

  if (entity.classification === 'suspicious') {
    return RENDER_PALETTE.suspicious;
  }

  return RENDER_PALETTE.neutral;
}
