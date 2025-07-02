import { appendChildToContainer, Container } from 'hostConfig';
import { FiberNode, FiberRootNode } from './fiber';
import { MutationMask, NoFlags, Placement } from './fiberFlags';
import { HostComponent, HostRoot, HostText } from './workTags';

let nextEffect: FiberNode | null = null;
export const commitMutationEffects = (finishedWork: FiberNode) => {
	nextEffect = finishedWork;

	while (nextEffect !== null) {
		const child: FiberNode | null = nextEffect.child;
		if (
			(nextEffect.subtreeFlags & MutationMask) !== NoFlags &&
			child !== null
		) {
			// 往下遍历
			nextEffect = child;
		} else {
			// 向上遍历
			up: while (nextEffect !== null) {
				commitMutationEffectOnFiber(nextEffect);
				const sibling: FiberNode | null = nextEffect.sibling;
				if (sibling !== null) {
					nextEffect = sibling;
					break up;
				}
				nextEffect = nextEffect.return;
			}
		}
	}
};

const commitMutationEffectOnFiber = (finishedWork: FiberNode) => {
	const flags = finishedWork.flags;
	// flags Placement
	if ((flags & Placement) !== NoFlags) {
		commitPlacement(finishedWork);
		finishedWork.flags &= ~Placement;
	}
	// flags update
	// if ((flags & Update) !== NoFlags) {
	// 	commitUpdate(finishedWork);
	// 	finishedWork.flags &= ~Update;
	// }
	// flags childDeletion
	// if ((flags & ChildDeletion) !== NoFlags) {
	// 	const deletions = finishedWork.deletions;
	// 	if (deletions !== null) {
	// 		deletions.forEach((childToDelete) => {
	// 			commitDeletion(childToDelete);
	// 		});
	// 	}
	// 	finishedWork.flags &= ~ChildDeletion;
	// }
};
function commitPlacement(finishedWork: FiberNode) {
	if (__DEV__) {
		console.log('执行Placement操作', finishedWork);
	}
	// 找到parent Dom
	const hostParent = getHostParent(finishedWork);

	if (hostParent !== null) {
		appendPlacementNodeIntoContainer(finishedWork, hostParent);
	}
	// finishedWork ~ Dom append hostParent ~ Dom
}

function getHostParent(fiber: FiberNode): Container | null {
	let parent = fiber.return;
	while (parent !== null) {
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

function appendPlacementNodeIntoContainer(
	finishedWork: FiberNode,
	hostParent: Container
) {
	// 先找到finishedWork ~ Dom
	if (finishedWork.tag === HostComponent || finishedWork.tag === HostText) {
		appendChildToContainer(hostParent, finishedWork.stateNode);
		return;
	}
	const child = finishedWork.child;
	if (child !== null) {
		appendPlacementNodeIntoContainer(child, hostParent);

		let sibling = child.sibling;
		while (sibling !== null) {
			appendPlacementNodeIntoContainer(sibling, hostParent);
			sibling = sibling.sibling;
		}
	}
}
