import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { FiberNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	UpdateQueue
} from './updateQueue';
import { Action } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';

/** 当前正在渲染的Fiber节点 */
let currentlyRenderingFiber: FiberNode | null = null;
/** 当前正在处理的Hook链表节点 */
let workInProgressHook: Hook | null = null;

let currentHook: Hook | null = null;

let renderLane: Lane = NoLane;

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

export interface Effect {
	tag: Flags;
	create: EffectCallback | void;
	destroy: EffectCallback | void;
	// 依赖数组
	deps: EffectDeps;
	// 下一个Effect节点
	next: Effect | null;
}

type EffectCallback = () => void;
type EffectDeps = any[] | null;

export interface FCUpdateQueue<State> extends UpdateQueue<State> {
	lastEffect: Effect | null;
}

/**
 * 协调阶段处理函数组件的Hooks
 * @param wip 当前工作中的Fiber节点
 * @returns 组件渲染结果
 */
export function renderWithHooks(wip: FiberNode, lane: Lane) {
	// 设置当前渲染的Fiber节点
	currentlyRenderingFiber = wip;
	// 重置Fiber的memoizedState（重置Hook链表）
	wip.memoizedState = null;
	// 重置effect链表
	wip.updateQueue = null;
	renderLane = lane;

	const current = wip.alternate;
	// 判断是更新还是首次挂载
	if (current !== null) {
		// update
		currentDispatcher.current = HookDispatcherOnUpdate;
	} else {
		// mount
		currentDispatcher.current = HookDispatcherOnMount;
	}
	// 执行组件函数获取渲染结果
	const Component = wip.type;
	const props = wip.pendingProps;
	// FC render
	const children = Component(props);
	// 重置当前渲染的Fiber节点
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
	renderLane = NoLane;
	return children;
}

/** 挂载阶段的Hook调度器实现 */
const HookDispatcherOnMount: Dispatcher = {
	useState: mountState,
	useEffect: mountEffect
};
/** 更新阶段的Hook调度器实现 */
const HookDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect
};

// mount时的useEffect
function mountEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = mountWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
	hook.memoizedState = pushEffect(
		Passive | HookHasEffect,
		create,
		undefined,
		nextDeps
	);
}

// update时的useEffect
function updateEffect(create: EffectCallback | void, deps: EffectDeps | void) {
	const hook = updateWorkInProgressHook();
	const nextDeps = deps === undefined ? null : deps;

	let destroy: EffectCallback | void;
	if (currentHook !== null) {
		const prevEffect = currentHook.memoizedState as Effect;
		destroy = prevEffect.destroy;

		if (nextDeps !== null) {
			// 浅比较依赖
			const prevDeps = prevEffect.deps;
			console.log('updateEffect', prevDeps, nextDeps);
			console.log('areHookInputEqual', areHookInputEqual(nextDeps, prevDeps));
			if (areHookInputEqual(nextDeps, prevDeps)) {
				hook.memoizedState = pushEffect(Passive, create, destroy, nextDeps);
				return;
			}
		}
		// 浅比较 不相等
		(currentlyRenderingFiber as FiberNode).flags |= PassiveEffect;
		hook.memoizedState = pushEffect(
			Passive | HookHasEffect,
			create,
			destroy,
			nextDeps
		);
	}
}

// 比较依赖项是否相同
function areHookInputEqual(nextDeps: EffectDeps, prevDeps: EffectDeps) {
	if (prevDeps === null || nextDeps === null) {
		return false;
	}
	for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
		if (Object.is(nextDeps[i], prevDeps[i])) {
			continue;
		}
		return false;
	}
	return true;
}

// 维护Effect链表
function pushEffect(
	hookFlags: Flags,
	create: EffectCallback | void,
	destroy: EffectCallback | void,
	deps: EffectDeps
): Effect {
	const effect: Effect = {
		tag: hookFlags,
		create,
		destroy,
		deps,
		next: null
	};
	const fiber = currentlyRenderingFiber as FiberNode;
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue === null) {
		const updateQueue = createFCUpdateQueue();
		fiber.updateQueue = updateQueue;
		effect.next = effect;
		updateQueue.lastEffect = effect;
	} else {
		// 插入effect
		const lastEffect = updateQueue.lastEffect;
		if (lastEffect === null) {
			effect.next = effect;
			updateQueue.lastEffect = effect;
		} else {
			const firstEffect = lastEffect.next;
			lastEffect.next = effect;
			effect.next = firstEffect;
			updateQueue.lastEffect = effect;
		}
	}
	return effect;
}

/**
 * 创建函数组件的更新队列(Effect链表)
 * @returns FCUpdateQueue<State>
 */
function createFCUpdateQueue<State>() {
	const updateQueue = createUpdateQueue<State>() as FCUpdateQueue<State>;
	updateQueue.lastEffect = null;
	return updateQueue;
}

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	// 计算新状态值
	const queue = hook.UpdateQueue as UpdateQueue<State>;
	const pending = queue.shared.pending;
	queue.shared.pending = null;
	if (pending !== null) {
		const { memoizedState } = processUpdateQueue(
			hook.memoizedState,
			pending,
			renderLane
		);
		hook.memoizedState = memoizedState;
	}

	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

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
	const lane = requestUpdateLane();
	const update = createUpdate(action, lane);
	enqueueUpdate(updateQueue, update);
	scheduleUpdateOnFiber(fiber, lane);
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

function updateWorkInProgressHook(): Hook {
	// TODO render
	let nextCurrentHook: Hook | null;
	if (currentHook === null) {
		// FC update 第一个hook
		const current = (currentlyRenderingFiber as FiberNode)?.alternate;
		if (current !== null) {
			nextCurrentHook = current.memoizedState;
		} else {
			// mount阶段
			nextCurrentHook = null;
		}
	} else {
		// FC update 后续hook
		nextCurrentHook = currentHook.next;
	}

	if (nextCurrentHook === null) {
		// mount/update u1 u2 u3
		// update       u1 u2 u3 u4
		throw new Error('hook数量不一致');
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		UpdateQueue: currentHook.UpdateQueue,
		next: null
	};
	if (workInProgressHook === null) {
		if (currentlyRenderingFiber === null) {
			throw new Error('请在函数组件内调用hook');
		} else {
			// 将首个Hook节点设置为Fiber的memoizedState
			workInProgressHook = newHook;
			currentlyRenderingFiber.memoizedState = workInProgressHook;
		}
	} else {
		// mount时后续的hook，添加到链表尾部
		workInProgressHook.next = newHook;
		workInProgressHook = newHook;
	}
	return workInProgressHook;
}
