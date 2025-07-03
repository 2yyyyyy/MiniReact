import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { FiberNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	UpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';

/** 当前正在渲染的Fiber节点 */
let currentlyRenderingFiber: FiberNode | null = null;
/** 当前正在处理的Hook链表节点 */
let workInProgressHook: Hook | null = null;

/** 获取当前环境下hooks调度器（区分首次挂载和更新） */
const { currentDispatcher } = internals;

/** Hook的数据结构定义 */
interface Hook {
	/** 当前Hook的状态值 */
	memoizedState: any;
	/** 更新队列，存储待处理的更新 */
	UpdateQueue: unknown;
	/** 指向下一个Hook的指针，形成链表结构 */
	next: Hook | null;
}

/**
 * 协调阶段处理函数组件的Hooks
 * @param wip 当前工作中的Fiber节点
 * @returns 组件渲染结果
 */
export function renderWithHooks(wip: FiberNode) {
	// 设置当前渲染的Fiber节点
	currentlyRenderingFiber = wip;
	// 重置Fiber的memoizedState（存储Hook链表）
	wip.memoizedState = null;
	// 判断是更新还是首次挂载
	if (wip.alternate !== null) {
		// update
	} else {
		// mount
		currentDispatcher.current = HookDispatcherOnMount;
	}
	// 执行组件函数获取渲染结果
	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);
	// 重置当前渲染的Fiber节点
	currentlyRenderingFiber = null;
	return children;
}

/** 挂载阶段的Hook调度器实现 */
const HookDispatcherOnMount: Dispatcher = {
	useState: mountState
};

/**
 * 实现useState钩子的挂载逻辑
 * @param initialState 初始状态值或状态初始化函数
 * @returns [当前状态, 状态更新函数]
 */
function mountState<State>(
	initialState: State | (() => State)
): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = mountWorkInProgressHook();

	// 处理初始状态（支持函数形式的初始值）
	let memoizedState;
	if (initialState instanceof Function) {
		memoizedState = initialState();
	} else {
		memoizedState = initialState;
	}

	const queue = createUpdateQueue<State>();
	hook.UpdateQueue = queue;
	hook.memoizedState = memoizedState;

	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

/**
 * 处理状态更新的函数
 * @param fiber 关联的Fiber节点
 * @param updateQueue 更新队列
 * @param action 状态更新动作（新状态值或状态更新函数）
 */
function dispatchSetState<State>(
	fiber: FiberNode,
	updateQueue: UpdateQueue<State>,
	action: Action<State>
) {
	const update = createUpdate(action);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber);
}

function mountWorkInProgressHook(): Hook {
	const hook: Hook = {
		memoizedState: null,
		UpdateQueue: null,
		next: null
	};
	// mount时第一个hook
	if (workInProgressHook === null) {
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			// 将首个Hook节点设置为Fiber的memoizedState
			workInProgressHook = hook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时后续的hook，添加到链表尾部
		workInProgressHook.next = hook;
		workInProgressHook = hook;
	}
	return workInProgressHook;
}
