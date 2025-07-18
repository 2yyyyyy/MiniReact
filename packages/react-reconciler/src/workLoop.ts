import { beginWork } from './beginWork';
import { commitMutationEffects } from './commitWork';
import { completeWork } from './completeWork';
import { createWorkInProgress, FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags } from './fiberFlags';
import { HostRoot } from './workTags';

// 工作指针
let workInProgress: FiberNode | null = null;

//
function prepareFreshStact(root: FiberRootNode) {
	workInProgress = createWorkInProgress(root.current, {});
}

export function scheduleUpdateOnFiber(fiber: FiberNode) {
	const root = markUpdateFromFiberToRoot(fiber);
	renderRoot(root);
}

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

function renderRoot(root: FiberRootNode) {
	prepareFreshStact(root); // 初始化工作栈
	do {
		try {
			workLoop(); // 执行工作循环
			break;
		} catch (e) {
			if (__DEV__) {
				console.log('workLoop 发生错误', e);
			}
			workInProgress = null; // 错误处理：重置工作指针
		}
	} while (true);

	const finishedWork = root.current.alternate;
	root.finishedWork = finishedWork;

	commitRoot(root);
}

function commitRoot(root: FiberRootNode) {
	const finishedWork = root.finishedWork;
	if (finishedWork === null) {
		return;
	}
	if (__DEV__) {
		console.log('commit阶段开始', finishedWork);
	}
	root.finishedWork = null;

	const subtreeHasEffect =
		(finishedWork.subtreeFlags & MutationMask) !== NoFlags;
	const rootHasEffect = (finishedWork.flags & MutationMask) !== NoFlags;
	if (subtreeHasEffect || rootHasEffect) {
		// beforeMutation
		// mutation Placement
		commitMutationEffects(finishedWork);
		root.current = finishedWork;
		// layout
	} else {
		root.current = finishedWork;
	}
}

// 持续处理工作单元，直到所有任务完成
function workLoop() {
	while (workInProgress !== null) {
		performUnitOfWork(workInProgress);
	}
}

// 处理单个工作单元：
// 1. 执行 beginWork 处理当前节点（创建子 Fiber）
// 2. 根据返回值决定继续“递”或开始“归”
function performUnitOfWork(fiber: FiberNode) {
	const next = beginWork(fiber); // 处理当前节点，返回子 Fiber
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
