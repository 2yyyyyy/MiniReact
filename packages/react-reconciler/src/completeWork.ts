import { FiberNode } from './fiber';

export const completeWork = (fiber: FiberNode) => {
	// 向上回溯处理兄弟节点和父节点，完成副作用收集。
};
