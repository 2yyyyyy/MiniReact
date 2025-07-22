export type Flags = number;

export const NoFlags = 0b0000000;
export const Placement = 0b0000001;
export const Update = 0b0000010;
export const ChildDeletion = 0b0000100;

// 当前fiber更新时需要处理副作用
export const PassiveEffect = 0b0001000;

export const Ref = 0b0010000;

export const MutationMask = Placement | Update | ChildDeletion | Ref;

export const LayoutMask = Ref;

export const PassiveMask = PassiveEffect | ChildDeletion;
