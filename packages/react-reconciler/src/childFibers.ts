import { ReactElementType } from 'shared/ReactTypes';
import { createFiberFromElement, FiberNode } from './fiber';
import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import { HostText } from './workTags';
import { Placement } from './fiberFlags';

/**
 * 创建子节点调和器的工厂函数
 * @param shouldTrackEffects 是否追踪副作用
 */
function ChildReconciler(shouldTrackEffects: boolean) {
	/**
	 * 处理单个React元素的调和
	 */
	function reconcilerSingleElement(
		returnFiber: FiberNode, // 父Fiber
		currentFiber: FiberNode | null, // 当前Fiber
		element: ReactElementType // React元素
	) {
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
		// 正确: 使用HostText
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
	return function reconcilerChildren(
		returnFiber: FiberNode,
		currentFiber: FiberNode | null,
		newChild?: ReactElementType
	) {
		// 处理对象类型的子节点(通常是React元素)
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

		// 其他未实现的类型
		if (__DEV__) {
			console.warn('未实现的reconciler类型', newChild);
		}
		return null;
	};
}

// 导出两个调和器实例
export const reconcilerChildFibers = ChildReconciler(true); // 更新时使用，追踪副作用
export const mountChildFibers = ChildReconciler(false); // 挂载时使用，不追踪副作用
