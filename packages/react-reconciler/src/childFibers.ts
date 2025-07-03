import { Props, ReactElementType } from 'shared/ReactTypes';
import {
	createFiberFromElement,
	createWorkInProgress,
	FiberNode
} from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { ChildDeletion, Placement } from './fiberFlags';

/**
 * 创建子节点调和器的工厂函数
 * @param shouldTrackEffects 是否追踪副作用
 */
function ChildReconciler(shouldTrackEffects: boolean) {
	function deleteChild(returnFiber: FiberNode, childToDelete: FiberNode) {
		if (!shouldTrackEffects) {
			return;
		}
		const deletions = returnFiber.deletions;
		if (deletions === null) {
			returnFiber.deletions = [childToDelete];
			returnFiber.flags |= ChildDeletion;
		} else {
			deletions.push(childToDelete);
		}
	}

	/**
	 * 处理单个React元素的调和
	 */
	function reconcilerSingleElement(
		returnFiber: FiberNode, // 父Fiber
		currentFiber: FiberNode | null, // 当前Fiber
		element: ReactElementType // React元素
	) {
		// update时判断是否能复用
		const key = element.key;
		if (currentFiber !== null) {
			// update阶段
			if (currentFiber.key === key) {
				if (element.$$typeof === REACT_ELEMENT_TYPE) {
					// key相同 比较type
					if (currentFiber.type === element.type) {
						// type相同 复用
						const existing = useFiber(currentFiber, element.props);
						existing.return = returnFiber;
						return existing;
					}
					// 删掉旧的
					deleteChild(returnFiber, currentFiber);
				} else {
					if (__DEV__) {
						console.warn('还未实现的react类型', element);
					}
				}
			} else {
				// 删掉旧的
				deleteChild(returnFiber, currentFiber);
			}
		}

		const fiber = createFiberFromElement(element); // 从元素创建Fiber
		fiber.return = returnFiber; // 设置父Fiber引用
		return fiber;
	}

	/**
	 * 处理单个文本节点的调和
	 */
	function reconcilerSingleTextNode(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		content: string | number
	) {
		if (currentFiber !== null) {
			// update
			if (currentFiber.tag === HostText) {
				// 类型没变
				const existing = useFiber(currentFiber, { content });
				existing.return = returnFiber;
				return existing;
			}
			// 删掉旧的
			deleteChild(returnFiber, currentFiber);
		}

		const fiber = new FiberNode(HostText, { content }, null);
		fiber.return = returnFiber;
		return fiber;
	}

	/**
	 * 标记需要插入的Fiber节点
	 */
	function placeSingleChild(fiber: FiberNode) {
		// 如果需要追踪副作用且是首次挂载
		if (shouldTrackEffects && fiber.alternate === null) {
			fiber.flags |= Placement; // 添加Placement标记
		}
		return fiber;
	}

	/**
	 * 子节点调和器主函数
	 */
	return function reconcilerChildFibers(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 处理对象类型的子节点(ReactElementType)
		if (typeof newChild === 'object' && newChild !== null) {
			switch (newChild.$$typeof) {
				case REACT_ELEMENT_TYPE: // 标准React元素
					return placeSingleChild(
						reconcilerSingleElement(returnFiber, currentFiber, newChild)
					);
				default:
					if (__DEV__) {
						console.warn('未实现的reconciler类型', newChild);
					}
					break;
			}
		}

		// 处理文本节点
		if (typeof newChild === 'string' || typeof newChild === 'number') {
			return placeSingleChild(
				reconcilerSingleTextNode(returnFiber, currentFiber, newChild)
			);
		}

		if (currentFiber !== null) {
			deleteChild(returnFiber, currentFiber);
		}

		// 其他未实现的类型
		if (__DEV__) {
			console.warn('未实现的reconciler类型', newChild);
		}
		return null;
	};
}

function useFiber(fiber: FiberNode, pendingProps: Props): FiberNode {
	const clone = createWorkInProgress(fiber, pendingProps);
	clone.index = 0;
	clone.sibling = null;
	return clone;
}

// 导出两个调和器实例
export const reconcilerChildFibers = ChildReconciler(true); // 更新时使用，追踪副作用
export const mountChildFibers = ChildReconciler(false); // 挂载时使用，不追踪副作用
