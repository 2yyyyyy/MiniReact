import { FiberNode } from './fiber';
import { processUpdateQueue, UpdateQueue } from './updateQueue';
import {
	Fragment,
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { mountChildFibers, reconcilerChildFibers } from './childFibers';
import { ReactElementType } from 'shared/ReactTypes';
import { renderWithHooks } from './fiberHooks';

/**
 * 开始处理Fiber节点的核心函数
 * 根据不同的Fiber类型执行不同的更新逻辑
 */
export const beginWork = (wip: FiberNode) => {
	// 根据Fiber节点类型选择不同的处理方式
	switch (wip.tag) {
		case HostRoot:
			return updateHostRoot(wip);
		case HostComponent:
			// return updateHostComponent(wip);
			return updateHostComponent(wip);
		case HostText:
			return null;
		case FunctionComponent:
			return updateFunctionComponent(wip);
		case Fragment:
			return updateFragment(wip);
		default:
			if (__DEV__) {
				console.warn('beginWork未实现的类型', wip);
			}
			break;
	}
	return null;
};

function updateFragment(wip: FiberNode) {
	const nextChildren = wip.pendingProps;
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

function updateFunctionComponent(wip: FiberNode) {
	const nextChildren = renderWithHooks(wip);
	reconcileChildren(wip, nextChildren);
	return wip.child;
}

/**
 * 更新HostRoot类型的Fiber节点
 */
function updateHostRoot(wip: FiberNode) {
	const baseState = wip.memoizedState; // 获取当前状态
	const updateQueue = wip.updateQueue as UpdateQueue<Element>; // 获取更新队列
	const pending = updateQueue.shared.pending; // 获取待处理的更新
	updateQueue.shared.pending = null; // 清空更新队列

	// 处理更新队列，获取新状态
	const { memoizedState } = processUpdateQueue(baseState, pending);
	wip.memoizedState = memoizedState; // 更新memoizedState

	const nextChildren = wip.memoizedState; // 子节点来自memoizedState
	reconcileChildren(wip, nextChildren); // 调和子节点
	return wip.child; // 返回第一个子节点继续处理
}

/**
 * 更新HostComponent类型的Fiber节点
 */
function updateHostComponent(wip: FiberNode) {
	const nextProps = wip.pendingProps; // 获取待处理的props
	const nextChildren = nextProps.children; // 子节点来自props.children
	reconcileChildren(wip, nextChildren); // 调和子节点
	return wip.child; // 返回第一个子节点继续处理
}

/**
 * 调和当前Fiber节点的子节点
 */
function reconcileChildren(wip: FiberNode, children?: ReactElementType) {
	const current = wip.alternate; // 获取对应的current Fiber
	if (current !== null) {
		// 更新阶段 - 使用reconcilerChildFibers会追踪副作用
		wip.child = reconcilerChildFibers(wip, current.child, children);
	} else {
		// 挂载阶段 - 使用mountChildFibers不追踪副作用
		wip.child = mountChildFibers(wip, null, children);
	}
}
