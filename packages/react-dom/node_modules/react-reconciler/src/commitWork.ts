import {
	appendChildToContainer,
	commitTextUpdate,
	commitUpdate,
	Container,
	hideInstance,
	hideTextInstance,
	insertChildToContainer,
	Instance,
	removeChild,
	unhideInstance,
	unhideTextInstance
} from 'hostConfig';
import { FiberNode, FiberRootNode, PendingPassiveEffects } from './fiber';
import {
	ChildDeletion,
	Flags,
	LayoutMask,
	MutationMask,
	NoFlags,
	PassiveEffect,
	PassiveMask,
	Placement,
	Ref,
	Update,
	Visibility
} from './fiberFlags';
import {
	FunctionComponent,
	HostComponent,
	HostRoot,
	HostText,
	OffscreenComponent
} from './workTags';
import { Effect, FCUpdateQueue } from './fiberHooks';
import { HookHasEffect } from './hookEffectTags';

// 当前正在处理的副作用 fiber 节点
let nextEffect: FiberNode | null = null;
// 遍历并处理 Mutation 类型的副作用（插入、更新、删除）

// commit阶段子阶段
export const commitEffects = (
	phrase: 'mutation' | 'layout',
	mask: Flags,
	callback: (fiber: FiberNode, root: FiberRootNode) => void
) => {
	return (finishedWork: FiberNode, root: FiberRootNode) => {
		nextEffect = finishedWork;
		while (nextEffect !== null) {
			const child: FiberNode | null = nextEffect.child;
			// 如果子树中有 mutation 副作用，则向下进入子节点
			if ((nextEffect.subtreeFlags & mask) !== NoFlags && child !== null) {
				// 向下遍历直到叶子节点（如 HostComponent、HostText），因为只有叶子节点才直接对应真实 DOM 操作
				nextEffect = child;
			} else {
				// 向上遍历，直到处理完当前节点并找到兄弟节点
				up: while (nextEffect !== null) {
					// 执行当前节点的 mutation 操作
					callback(nextEffect, root);
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
};

// 执行commit操作
const commitMutationEffectOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;
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
				commitDeletion(childToDelete, root);
			});
		}
		finishedWork.flags &= ~ChildDeletion;
	}

	if ((flags & PassiveEffect) !== NoFlags) {
		// 检查 fiber 节点的 PassiveEffect 标志，
		// 如果有则调用 commitPassiveEffect 来处理 useEffect 相关的副作用，
		// 然后清除这个标志
		commitPassiveEffect(finishedWork, root, 'update');
		finishedWork.flags &= ~PassiveEffect;
	}

	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		// 解绑之前的ref
		safelyDetachRef(finishedWork);
	}

	if ((flags & Visibility) !== NoFlags && tag === OffscreenComponent) {
		const isHidden = finishedWork.pendingProps.mode === 'hidden';
		// 隐藏子树顶层Host节点 visibility node
		hideOrUnhideAllChildren(finishedWork, isHidden);
		finishedWork.flags &= ~Visibility;
	}
};

function hideOrUnhideAllChildren(finishedWork: FiberNode, isHidden: boolean) {
	findHostSubtreeRoot(finishedWork, (hostRoot) => {
		const instance = hostRoot.stateNode;
		if (hostRoot.tag === HostComponent) {
			isHidden ? hideInstance(instance) : unhideInstance(instance);
		} else if (hostRoot.tag === HostText) {
			isHidden
				? hideTextInstance(instance)
				: unhideTextInstance(instance, hostRoot.memoizedProps.content);
		}
	});
}

// 找到子树顶层host节点
function findHostSubtreeRoot(
	finishedWork: FiberNode,
	callback: (hostSubtreeRoot: FiberNode) => void
) {
	let node = finishedWork;
	let hostSubtreeRoot = null;
	while (true) {
		// TODO 处理逻辑
		if (node.tag === HostComponent) {
			if (hostSubtreeRoot === null) {
				hostSubtreeRoot = node;
				callback(node);
			}
		} else if (node.tag === HostText) {
			if (hostSubtreeRoot === null) {
				callback(node);
			}
		} else if (
			node.tag === OffscreenComponent &&
			node.pendingProps.mode === 'hidden' &&
			node !== finishedWork
		) {
			//Offscreen嵌套
		} else if (node.child !== null) {
			node.child.return = node;
			node = node.child;
			continue;
		}
		//  1. 遇到子节点：往下走（DFS）
		// 如果当前节点有子节点，则进入子节点；
		// 同时将子节点的 return 指向当前节点（即设置“父节点”引用）；
		// 然后继续下一轮循环（继续向下钻）。

		// 2. 当前为叶子节点 且回到根：结束遍历
		// 如果我们回到了根节点，并且它已经没有子节点或兄弟节点了，说明遍历完成，退出。
		if (node === finishedWork) {
			return;
		}

		// 3. 向上回溯，找兄弟节点
		// 如果当前节点没有兄弟节点（说明是其父节点的最后一个子节点），就向上回溯，直到找到一个存在兄弟节点的父节点；
		// 如果回溯到根了（没有父节点或等于 finishedWork），说明整棵树遍历完了，退出。
		while (node.sibling === null) {
			if (node.return === null || node.return === finishedWork) {
				return;
			}

			if (hostSubtreeRoot === node) {
				hostSubtreeRoot = null;
			}

			node = node.return;
		}
		// 4. 找到兄弟节点，转过去继续
		// 找到了兄弟节点，就跳过去，并设置它的 return 为当前节点的父节点。
		if (hostSubtreeRoot === node) {
			hostSubtreeRoot = null;
		}
		node.sibling.return = node.return;
		node = node.sibling;
	}
}

const commitLayoutEffectOnFiber = (
	finishedWork: FiberNode,
	root: FiberRootNode
) => {
	const { flags, tag } = finishedWork;
	// flags Placement 插入（挂载新 DOM）
	if ((flags & Ref) !== NoFlags && tag === HostComponent) {
		// 绑定新的ref
		safelyAttachRef(finishedWork);
		finishedWork.flags &= ~Ref;
	}
};

// 绑定ref
function safelyAttachRef(fiber: FiberNode) {
	const ref = fiber.ref;
	if (ref !== null) {
		const instance = fiber.stateNode;
		if (typeof ref === 'function') {
			ref(instance);
		} else {
			ref.current = instance;
		}
	}
}
// 解绑ref
function safelyDetachRef(current: FiberNode) {
	const ref = current.ref;
	if (ref !== null) {
		if (typeof ref === 'function') {
			ref(null);
		} else {
			ref.current = null;
		}
	}
}

// 收集回调
// 只处理函数组件
// 获取 fiber 的更新队列中的 effect 链表
// 将 effect 链表添加到 pendingPassiveEffects 中，等待后续处理
// type 参数可以是 'update' 或 'unmount'，分别对应组件的更新和卸载
function commitPassiveEffect(
	fiber: FiberNode,
	root: FiberRootNode,
	type: keyof PendingPassiveEffects
) {
	if (
		fiber.tag !== FunctionComponent ||
		(type === 'update' && (fiber.flags & PassiveEffect) === NoFlags)
	) {
		return;
	}
	const updateQueue = fiber.updateQueue as FCUpdateQueue<any>;
	if (updateQueue !== null) {
		if (updateQueue.lastEffect === null && __DEV__) {
			console.error('FC PassiveEffect flags lastEffect 为空');
		}
		root.pendingPassiveEffects[type].push(updateQueue.lastEffect as Effect);
	}
}

// 遍历 effect 循环链表
// 对每个 effect，检查其 tag 是否包含指定的 flag
// 如果匹配，则执行回调函数
// 这个函数是其他具体 effect 处理函数的基础
function commitHookEffectList(
	flag: Flags,
	lastEffect: Effect,
	callback: (effect: Effect) => void
) {
	let effect = lastEffect.next as Effect;
	do {
		if ((effect.tag & flag) === flag) {
			callback(effect);
		}
		effect = effect.next as Effect;
	} while (effect !== lastEffect.next);
}

// 调用 effect 的 destroy 函数（如果存在）
// 清除 HookHasEffect 标志
// 用于组件卸载时执行清理函数
export function commitHookEffectListUnmount(
	flag: Flags,
	lastEffect: Effect
	// callback: (effect: Effect) => void
) {
	commitHookEffectList(flag, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
		effect.tag &= ~HookHasEffect;
	});
}

// 只执行 destroy 函数
// 用于在依赖项变化时先执行上一次 effect 的清理函数
export function commitHookEffectListDestroy(
	flag: Flags,
	lastEffect: Effect
	// callback: (effect: Effect) => void
) {
	commitHookEffectList(flag, lastEffect, (effect) => {
		const destroy = effect.destroy;
		if (typeof destroy === 'function') {
			destroy();
		}
	});
}

// 执行 effect 的 create 函数
// 将返回值保存为 destroy 函数
// 用于初始化 effect 或依赖项变化后重新执行 effect
export function commitHookEffectListCreate(
	flag: Flags,
	lastEffect: Effect
	// callback: (effect: Effect) => void
) {
	commitHookEffectList(flag, lastEffect, (effect) => {
		const create = effect.create;
		if (typeof create === 'function') {
			effect.destroy = create();
		}
	});
}

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

// 执行删除操作 组件卸载
function commitDeletion(childToDelete: FiberNode, root: FiberRootNode) {
	const rootChildrenToDelete: FiberNode[] = [];
	// 递归子树
	commitNestedComponent(childToDelete, (unmountFiber) => {
		switch (unmountFiber.tag) {
			case HostComponent:
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				// 解绑ref
				safelyDetachRef(unmountFiber);
				return;
			case HostText:
				// 找到第一个真实 DOM 节点，用于后续 removeChild
				recordHostChildrenToDelete(rootChildrenToDelete, unmountFiber);
				return;
			case FunctionComponent:
				console.log('commitPassiveEffect', unmountFiber);
				commitPassiveEffect(unmountFiber, root, 'unmount');
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

export const commitMutationEffects = commitEffects(
	'mutation',
	MutationMask | PassiveMask,
	commitMutationEffectOnFiber
);

export const commitLayoutEffects = commitEffects(
	'layout',
	LayoutMask | PassiveMask,
	commitLayoutEffectOnFiber
);
