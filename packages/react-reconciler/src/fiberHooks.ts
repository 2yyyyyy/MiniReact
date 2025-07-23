import { Dispatch, Dispatcher } from 'react/src/currentDispatcher';
import internals from 'shared/internals';
import { FiberNode } from './fiber';
import {
	createUpdate,
	createUpdateQueue,
	enqueueUpdate,
	processUpdateQueue,
	Update,
	UpdateQueue
} from './updateQueue';
import { Action, ReactContext, Thenable, Usable } from 'shared/ReactTypes';
import { scheduleUpdateOnFiber } from './workLoop';
import { Lane, NoLane, requestUpdateLane } from './fiberLanes';
import { Flags, PassiveEffect } from './fiberFlags';
import { HookHasEffect, Passive } from './hookEffectTags';
import currentBatchConfig from 'react/src/currentBatchConfig';
import { REACT_CONTEXT_TYPE } from 'shared/ReactSymbols';
import { trackUsedThenable } from './thenable';

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
	/** 并发更新时的初始状态值 */
	baseState: any;
	/** 并发更新时的更新队列 */
	baseQueue: Update<any> | null;
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
	useEffect: mountEffect,
	useTransition: mountTransition,
	useRef: mountRef,
	useContext: readContext,
	use
};
/** 更新阶段的Hook调度器实现 */
const HookDispatcherOnUpdate: Dispatcher = {
	useState: updateState,
	useEffect: updateEffect,
	useTransition: updateTransition,
	useRef: updateRef,
	useContext: readContext,
	use
};

function use<T>(usable: Usable<T>) {
	if (usable !== null && typeof usable === 'object') {
		if (typeof (usable as Thenable<T>).then === 'function') {
			// Thenable
			const thenable = usable as Thenable<T>;
			return trackUsedThenable(thenable);
		} else if ((usable as ReactContext<T>).$$typeof === REACT_CONTEXT_TYPE) {
			// ReactContext
			const context = usable as ReactContext<T>;
			return readContext(context);
		}
	}
	throw new Error('不支持的use参数' + usable);
}

export function resetHooksOnUnwind() {
	currentlyRenderingFiber = null;
	workInProgressHook = null;
	currentHook = null;
}

function readContext<T>(context: ReactContext<T>): T {
	const consumer = currentlyRenderingFiber;
	if (consumer === null) {
		throw new Error('只能在函数组件中调用useContext');
	}
	const value = context._currentValue;
	return value;
}

// re = useRef(null)
function mountRef<T>(initialValue: T): { current: T } {
	const hook = mountWorkInProgressHook();
	const ref = { current: initialValue };
	hook.memoizedState = ref;
	return ref;
}

function updateRef<T>(initialValue: T): { current: T } {
	const hook = updateWorkInProgressHook();
	return hook.memoizedState;
}

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
	hook.baseState = memoizedState;

	// @ts-ignore
	const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
	queue.dispatch = dispatch;
	return [memoizedState, dispatch];
}

function updateState<State>(): [State, Dispatch<State>] {
	// 找到当前useState对应的hook数据
	const hook = updateWorkInProgressHook();
	// 计算新状态值
	const queue = hook.UpdateQueue as UpdateQueue<State>;
	const baseState = hook.baseState;

	const pending = queue.shared.pending;
	const current = currentHook as Hook;
	let baseQueue = current.baseQueue;

	// pending baseQueue update 保存在current中
	if (pending !== null) {
		if (baseQueue !== null) {
			// 合并baseQueue和pending
			const baseFirst = baseQueue.next;
			const pendingFirst = pending.next;
			baseQueue.next = pendingFirst;
			pending.next = baseFirst;
		}
		baseQueue = pending;
		// 保存在current中
		current.baseQueue = pending;
		queue.shared.pending = null;
	}

	if (baseQueue !== null) {
		const {
			memoizedState,
			baseQueue: newBaseQueue,
			baseState: newBaseState
		} = processUpdateQueue(baseState, baseQueue, renderLane);
		hook.memoizedState = memoizedState;
		hook.baseState = newBaseState;
		hook.baseQueue = newBaseQueue;
	}
	return [hook.memoizedState, queue.dispatch as Dispatch<State>];
}

function mountTransition(): [boolean, (callback: () => null) => void] {
	// 初始化 isPending 状态为 false，用于表示当前是否处于 transition 状态
	// mountState 是 React 内部用于 useState 初始化的函数
	const [isPending, setIsPending] = mountState(false);

	// 注册一个 Hook 对象，挂在当前 fiber 的 memoizedState 上，用于存储 transition 函数
	const hook = mountWorkInProgressHook();

	// 创建 startTransition 函数，并绑定 setIsPending 作为第一个参数
	const start = startTransition.bind(null, setIsPending);

	// 把这个函数保存到当前 hook 中，便于更新时复用
	hook.memoizedState = start;

	// 返回 [状态, 启动函数]，即 useTransition 的值
	return [isPending, start];
}

function updateTransition(): [boolean, (callback: () => null) => void] {
	// 取出当前 isPending 状态值
	const [isPending] = updateState();

	// 获取当前 hook 对象
	const hook = updateWorkInProgressHook();

	// 取出保存的 startTransition 函数
	const start = hook.memoizedState;

	// 返回和 mount 时一样的结构
	return [isPending as boolean, start];
}

function startTransition(
	setIsPending: Dispatch<boolean>,
	callback: () => null
) {
	// 标记：进入 transition 中，触发刷新，显示 loading UI 等
	setIsPending(true);

	// 保存当前批处理配置中的 transition 标志（用于恢复现场）
	const prevTransition = currentBatchConfig.transition;

	// 设置全局的 batchConfig 标志：表示当前是 transition 更新
	currentBatchConfig.transition = 1;

	// 执行传入的更新函数，比如 setState()
	callback();

	// 结束 transition，状态恢复正常
	setIsPending(false);

	currentBatchConfig.transition = prevTransition;
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
		next: null,
		baseState: null,
		baseQueue: null
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
		console.log('hook数量不一致');
	}

	currentHook = nextCurrentHook as Hook;
	const newHook: Hook = {
		memoizedState: currentHook.memoizedState,
		UpdateQueue: currentHook.UpdateQueue,
		next: null,
		baseState: currentHook.baseState,
		baseQueue: currentHook.baseQueue
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
