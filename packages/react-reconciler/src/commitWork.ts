import {
	appendChildToContainer,
	commitTextUpdate,
	Container,
	insertChildToContainer,
	Instance,
	removeChild
} from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import {
	ChildDeletion,
	MutationMask,
	NoFlags,
	Placement,
	Update
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText
} from './workTags';
import { updateFiberProps } from 'react-dom/src/SyntheticEvent';

// 当前正在处理的副作用 fiber 节点
let nextEffect: FiberNode | null = null;
// 遍历并处理 Mutation 类型的副作用（插入、更新、删除）
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		const child: FiberNode | null = nextEffect.child;
		// 如果子树中有 mutation 副作用，则向下进入子节点
		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 向下遍历直到叶子节点（如 HostComponent、HostText），因为只有叶子节点才直接对应真实 DOM 操作
			nextEffect = child;
		} else {
			// 向上遍历，直到处理完当前节点并找到兄弟节点
			up: while (nextEffect !== null) {
				// 执行当前节点的 mutation 操作
				commitMutationEffectOnFiber(nextEffect);
				// 如果有兄弟节点，继续遍历兄弟进行处理
				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				// 向上回溯
				nextEffect = nextEffect.return;
			}
		}
	}
};

const commitMutationEffectOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;
	// flags Placement 插入（挂载新 DOM）
	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		finishedWork.flags &= ~Placement;
	}
	// flags update 更新 DOM 内容（如文本）
	if ((flags & Update) !== NoFlags) {
		commitUpdate(finishedWork);
		finishedWork.flags &= ~Update;
	}
	// flags childDeletion 删除 DOM
	if ((flags & ChildDeletion) !== NoFlags) {
		const deletions = finishedWork.deletions;
		if (deletions !== null) {
			deletions.forEach((childToDelete) => {
				commitDeletion(childToDelete);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}
};

function commitPlacement(finishedWork: FiberNode) {
	if (__DEV__) {
		console.log('执行Placement操作', finishedWork);
	}
	// 找到最近的父 DOM 容器
	const hostParent = getHostParent(finishedWork);
	// host sibing
	const sibling = getHostSibling(finishedWork);

	if (hostParent !== null) {
		// 将该节点（及其 DOM 子树）插入到 hostParent 中
		insertOrAppendPlacementNodeIntoContainer(finishedWork, hostParent, sibling);
	}
	// finishedWork ~ Dom append hostParent ~ Dom
}

// 找到host sibing
function getHostSibling(fiber: FiberNode) {
	let node: FiberNode = fiber;

	findSibing: while (true) {
		while (node.sibling === null) {
			// 向上
			const parent = node.return;
			if (
				parent === null ||
				parent.tag === HostComponent ||
				parent.tag === HostRoot
			) {
				return null;
			}
			node = parent;
		}

		node.sibling.return = node.return;
		node = node.sibling;
		while (node.tag !== HostText && node.tag !== HostComponent) {
			// 向下遍历
			if ((node.flags & Placement) !== NoFlags) {
				continue findSibing;
			}
			if (node.child === null) {
				continue findSibing;
			} else {
				node.child.return = node;
				node = node.child;
			}
		}

		if ((node.flags & Placement) === NoFlags) {
			return node.stateNode;
		}
	}
}

function commitUpdate(fiber: FiberNode) {
	if (__DEV__) {
		console.log('执行Update操作', fiber);
	}
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps?.content;
			commitTextUpdate(fiber.stateNode, text);
			break;
		// case HostComponent:
		// 	updateFiberProps()
		default:
			if (__DEV__) {
				console.warn('未实现的Update操作', fiber);
			}
			break;
	}
}

// 记录需要删除的 Host 组件
function recordHostChildrenToDelete(
	childToDelete: FiberNode[],
	unmountFiber: FiberNode
) {
	// 找到 childToDelete 中最后一个元素
	const lastOne = childToDelete[childToDelete.length - 1];
	if (!lastOne) {
		childToDelete.push(unmountFiber);
	} else {
		// 如果已经有了至少一个需要删除的 Fiber
		// 遍历 lastOne 后面的 sibling，看是否能找到当前 unmountFiber
		let node = lastOne.sibling;
		while (node !== null) {
			if (unmountFiber === node) {
				childToDelete.push(unmountFiber);
			}
			node = node.sibling;
		}
	}
}

function commitDeletion(childToDelete: FiberNode) {
	const rootChildrenToDelete: FiberNode[] = [];
	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case HostText:
				// 找到第一个真实 DOM 节点，用于后续 removeChild
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				// useEffect unmount
				return;
			default:
				if (__DEV__) {
					console.warn('未实现的unmount操作', unmountFiber);
				}
				return;
		}
	});
	// 移除rootHostComponent的dom
	if (rootChildrenToDelete.length !== 0) {
		const hostParent = getHostParent(childToDelete);
		if (hostParent !== null) {
			rootChildrenToDelete.forEach((node) => {
				removeChild(node.stateNode, hostParent);
			});
		}
	}

	childToDelete.return = null;
	childToDelete.child = null;
}

function commitNestedComponent(
	root: FiberNode,
	onCommitUnmount: (fiber: FiberNode) => void
) {
	let node = root;
	while (true) {
		onCommitUnmount(node);
		// 向下
		if (node.child !== null) {
			node.child.return = node;
			node = node.child;
			continue;
		}
		if (node === root) {
			return;
		}
		while (node.sibling === null) {
			if (node.return === null || node.return === root) {
				return;
			}
			node = node.return;
		}
		// 向上
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;
	while (parent) {
		const parentTag = parent.tag;
		if (parentTag === HostComponent) {
			return parent.stateNode;
		}
		if (parentTag === HostRoot) {
			return (parent.stateNode as FiberRootNode).container;
		}
		parent = parent.return;
	}
	if (__DEV__) {
		console.log('未找到host parent');
	}
	return null;
}

function insertOrAppendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container,
	before?: Instance
) {
	// 先找到finishedWork ~ Dom
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		if (before) {
			insertChildToContainer(finishedWork.stateNode, hostParent, before);
		} else {
			appendChildToContainer(hostParent, finishedWork.stateNode);
		}
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		insertOrAppendPlacementNodeIntoContainer(child, hostParent);

		let sibling = child.sibling;
		while (sibling !== null) {
			insertOrAppendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
