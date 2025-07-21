import { scheduleMictask } from 'hostConfig';
import { beginWork } from './beginWork';
import {
	commitHookEffectListCreate,
	commitHookEffectListDestroy,
	commitHookEffectListUnmount,
	commitMutationEffects
} from './commitWork';
import { completeWork } from './completeWork';
import {
	createWorkInProgress,
	FiberNode,
	FiberRootNode,
	PendingPassiveEffects
} from './fiber';
import { MutationMask, NoFlags, PassiveMask } from './fiberFlags';
import {
	getHighestPriorityLane,
	Lane,
	markRootFinished,
	mergeLanes,
	NoLane,
	SyncLane,
	lanesToSchedulerPriority
} from './fiberLanes';
import { flushSyncCallbacks, scheduleSyncCallback } from './syncTaskQueue';
import { HostRoot } from './workTags';
import {
	unstable_scheduleCallback as scheduleCallback,
	unstable_NormalPriority as NormalPriority,
	unstable_shouldYield,
	unstable_cancelCallback
} from 'scheduler';
import { HookHasEffect, Passive } from './hookEffectTags';

// 工作指针
let workInProgress: FiberNode | null = null;
// 当前render阶段的Lane
let wipRootRenderLane: Lane = NoLane;
//
let rootDoesHasPassiveEffect = false;

// render阶段flag
type RootExitStatus = number;
const RootInComplete = 1;
const RootCompleted = 2;
// TODO 执行过程报错

//
function prepareFreshStact(root: FiberRootNode, lane: Lane) {
	root.finishedLane = NoLane;
	root.finishedWork = null;
	workInProgress = createWorkInProgress(root.current, {});
	wipRootRenderLane = lane;
}

export function scheduleUpdateOnFiber(fiber: FiberNode, lane: Lane) {
	const root = markUpdateFromFiberToRoot(fiber);
	markRootUpdated(root, lane);
	// TODO 调度
	// renderRoot(root);
	ensureRootIsScheduled(root);
}

// schedule 调度阶段入口
function ensureRootIsScheduled(root: FiberRootNode) {
	// 根据优先级选出Lane
	const updateLane = root.pendingLanes;
	const existingCallback = root.callBackNode;

	if (updateLane === NoLane) {
		if (existingCallback !== null) {
			unstable_cancelCallback(existingCallback);
		}
		root.callBackNode = null;
		root.callBackPriority = NoLane;
		return;
	}

	const curPriority = updateLane;
	const prevPriority = root.callBackPriority;
	if (curPriority === prevPriority) {
		return;
	}

	if (existingCallback !== null) {
		unstable_cancelCallback(existingCallback);
	}

	let newCallbackNode = null;

	if (updateLane === SyncLane) {
		// 同步任务 微任务调度
		if (__DEV__) {
			console.log('微任务调度 优先级：', updateLane);
		}
		scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
		// 同步任务 微任务调度
		scheduleMictask(flushSyncCallbacks);
	} else {
		// 其它优先级 宏任务调度
		// 同步任务 微任务调度
		if (__DEV__) {
			console.log('宏任务调度 优先级：', updateLane);
		}
		const schedulerPriority = lanesToSchedulerPriority(updateLane);
		newCallbackNode = scheduleCallback(
			schedulerPriority,
			performConcurrentWorkOnRoot.bind(null, root)
		);
	}

	root.callBackNode = newCallbackNode;
	root.callBackPriority = curPriority;
}

// 更新根节点Lanes
function markRootUpdated(root: FiberRootNode, lane: Lane) {
	root.pendingLanes = mergeLanes(root.pendingLanes, lane);
}

// 从Fiber节点向上遍历，找到根节点
function markUpdateFromFiberToRoot(fiber: FiberNode) {
	let node = fiber;
	let parent = fiber.return;

	while (parent !== null) {
		node = parent;
		parent = node.return;
	}

	if (node.tag === HostRoot) {
		return node.stateNode;
	}
	return null;
}

// 同步更新 调度执行
function performSyncWorkOnRoot(root: FiberRootNode) {
	const nextLane = getHighestPriorityLane(root.pendingLanes);

	if (nextLane !== SyncLane) {
		// 优先级更低的Lane
		// NoLane
		ensureRootIsScheduled(root);
		return;
	}

	const existStatus = renderRoot(root, nextLane, false);

	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = nextLane;
		wipRootRenderLane = NoLane;

		commitRoot(root);
	} else {
		console.log('还未实现的同步更新结束状态', existStatus);
	}
}

// 并发更新 调度执行
function performConcurrentWorkOnRoot(
	root: FiberRootNode,
	didTimeout: boolean
): any {
	const curCallback = root.callBackNode;
	// 确保useEffect执行完成
	const didFlushPassiveEffect = flushPassiveEffects(root.pendingPassiveEffects);
	if (didFlushPassiveEffect) {
		if (root.callBackNode !== curCallback) {
			return null;
		}
	}

	const lane = getHighestPriorityLane(root.pendingLanes);
	const curCallbackNode = root.callBackNode;
	if (lane === NoLane) {
		return null;
	}
	const needSync = lane === SyncLane || didTimeout;
	// render阶段
	const existStatus = renderRoot(root, lane, !needSync);
	ensureRootIsScheduled(root);
	// 中断
	if (existStatus === RootInComplete) {
		if (root.callBackNode !== curCallbackNode) {
			// 更高优先级任务插入
			return null;
		}
		return performConcurrentWorkOnRoot.bind(null, root);
	}
	// 更新执行完
	if (existStatus === RootCompleted) {
		const finishedWork = root.current.alternate;
		root.finishedWork = finishedWork;
		root.finishedLane = lane;
		wipRootRenderLane = NoLane;

		commitRoot(root);
	} else {
		console.log('还未实现的并发更新结束状态', existStatus);
	}
}

// render阶段
function renderRoot(root: FiberRootNode, lane: Lane, shouldTimeSlice: boolean) {
	if (__DEV__) {
		console.log(`${shouldTimeSlice ? '并发' : '同步'}  render阶段开始`, root);
	}
	if (wipRootRenderLane !== lane) {
		prepareFreshStact(root, lane); // 初始化工作栈
	}

	do {
		try {
			// 开始render阶段
			shouldTimeSlice ? workLoopConcurrent() : workLoopSync();
			break;
		} catch (e) {
			if (__DEV__) {
				console.log('workLoop 发生错误', e);
			}
			workInProgress = null; // 错误处理：重置工作指针
		}
	} while (true);

	// 中断执行
	if (shouldTimeSlice && workInProgress !== null) {
		return RootInComplete;
	}
	// 执行完render阶段
	if (!shouldTimeSlice && workInProgress !== null && __DEV__) {
		console.error('render阶段结束wip不应该为null');
	}
	return RootCompleted;
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;
	if (finishedWork === null) {
		return;
	}
	if (__DEV__) {
		console.log('commit阶段开始', finishedWork);
	}

	const lane = root.finishedLane;
	if (lane === NoLane && __DEV__) {
		console.log('commit阶段finishedLane不应该是NoLane');
	}

	// 重置根节点的 finishedWork 和 finishedLane
	root.finishedWork = null;
	root.finishedLane = NoLane;
	markRootFinished(root, lane);
	if (
		(finishedWork.flags & PassiveMask) !== NoFlags ||
		(finishedWork.subtreeFlags & PassiveMask) !== NoFlags
	) {
		// 有副作用的FiberNode
		if (!rootDoesHasPassiveEffect) {
			rootDoesHasPassiveEffect = true;
			// 调度副作用
			scheduleCallback(NormalPriority, () => {
				// 执行副作用
				flushPassiveEffects(root.pendingPassiveEffects);
				return;
			});
		}
	}

	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;
	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		commitMutationEffects(finishedWork, root);

		root.current = finishedWork;
		// layout
	} else {
		root.current = finishedWork;
	}

	rootDoesHasPassiveEffect = false;
	ensureRootIsScheduled(root);
}

function flushPassiveEffects(pendingPassiveEffects: PendingPassiveEffects) {
	let didFlushPassiveEffect = false;
	// 处理 pendingPassiveEffects 中的副作用
	pendingPassiveEffects.unmount.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListUnmount(Passive, effect);
	});
	pendingPassiveEffects.unmount = [];

	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListDestroy(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update.forEach((effect) => {
		didFlushPassiveEffect = true;
		commitHookEffectListCreate(Passive | HookHasEffect, effect);
	});
	pendingPassiveEffects.update = [];
	flushSyncCallbacks();
	return didFlushPassiveEffect;
}

// 持续处理工作单元，直到所有任务完成
function workLoopSync() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}
// 并发render阶段
function workLoopConcurrent() {
	while (workInProgress !== null && !unstable_shouldYield()) {
		performUnitOfWork(workInProgress);
	}
}

// 处理单个工作单元：
// 1. 执行 beginWork 处理当前节点（创建子 Fiber）
// 2. 根据返回值决定继续“递”或开始“归”
function performUnitOfWork(fiber: FiberNode) {
	// 开始beginWork
	const next = beginWork(fiber, wipRootRenderLane); // 处理当前节点，返回子 Fiber
	fiber.memoizedProps = fiber.pendingProps; // 保存当前 props

	if (next === null) {
		completeUnitOfWork(fiber); // 没有子节点，开始向上“归”
	} else {
		workInProgress = next; // 有子节点，继续向下“递”
	}
}

// 完成当前节点的工作，并处理兄弟节点和父节点：
// 1. 执行 completeWork 完成当前节点的副作用收集
// 2. 检查是否有兄弟节点，有则处理兄弟节点
// 3. 若无兄弟节点，则向上回溯到父节点
function completeUnitOfWork(fiber: FiberNode) {
	let node: FiberNode | null = fiber;
	do {
		completeWork(node); // 完成当前节点的工作（如创建 DOM）
		// 检查是否有兄弟节点
		const sibling = node.sibling;
		if (sibling !== null) {
			workInProgress = sibling; // 有兄弟节点 → 切换到兄弟节点继续“递”
			return;
		}
		// 没有兄弟节点 → 向上回溯到父节点
		node = node.return;
		workInProgress = node;
	} while (node !== null);
}
