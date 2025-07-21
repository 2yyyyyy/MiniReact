import { Container } from 'hostConfig';
import {
	unstable_ImmediatePriority,
	unstable_NormalPriority,
	unstable_runWithPriority,
	unstable_UserBlockingPriority
} from 'scheduler';
import { Props } from 'shared/ReactTypes';

export const elementPropsKey = '__props'; // 存储 props 的 key，用于 DOMElement 上的自定义属性
const validEventTypeList = ['click']; // 当前支持的事件类型

type EventCallback = (e: Event) => void;

interface SyntheticEvent extends Event {
	__stopPropagation: boolean; // 标志是否停止冒泡
}

interface Paths {
	capture: EventCallback[]; // 捕获阶段的回调列表
	bubble: EventCallback[]; // 冒泡阶段的回调列表
}

// 扩展 DOM 节点类型，附加 props
export interface DOMElement extends Element {
	[elementPropsKey]: Props;
}

// 更新 DOMElement 上的 props（由 React 调用）
export function updateFiberProps(node: DOMElement, props: Props) {
	node[elementPropsKey] = props;
}

// 初始化事件（只在容器上绑定一次原生事件）
export function initEvent(container: Container, eventType: string) {
	if (!validEventTypeList.includes(eventType)) {
		console.warn(`不支持${eventType}事件`);
		return;
	}
	if (__DEV__) {
		console.log(`初始化${eventType}事件`);
	}
	// 容器级别注册事件监听器（事件委托）
	container.addEventListener(eventType, (e) => {
		dispatchEvent(container, eventType, e);
	});
}

// 事件派发：合成事件的核心逻辑
function dispatchEvent(container: Container, eventType: string, e: Event) {
	const targetElement = e.target;
	if (targetElement === null) {
		console.warn('事件不存在target', e);
		return;
	}

	// 1. 收集事件路径（从 targetElement 向上到 container）
	const { capture, bubble } = collectPaths(
		targetElement as DOMElement,
		container,
		eventType
	);
	// 2. 构造合成事件（模拟 React 的 stopPropagation）
	const se = createSyntheticEvent(e);

	// 3. 捕获阶段：从上到下执行
	triggerEventFlow(capture, se);

	// 4. 若未停止传播，执行冒泡阶段：从下到上
	if (!se.__stopPropagation) {
		triggerEventFlow(bubble, se);
	}
}

// 遍历事件路径并执行回调
function triggerEventFlow(paths: EventCallback[], se: SyntheticEvent) {
	for (let i = 0; i < paths.length; i++) {
		const callback = paths[i];
		unstable_runWithPriority(eventTypeToSchedulerPriority(se.type), () => {
			callback.call(null, se);
		});
		if (se.__stopPropagation) {
			break;
		}
	}
}

// 创建一个合成事件，重写 stopPropagation
function createSyntheticEvent(e: Event) {
	const syntheticEvent = e as SyntheticEvent;
	syntheticEvent.__stopPropagation = false;

	const originStopPropagation = e.stopPropagation.bind(e); // ✅ 绑定 this

	// 重写 stopPropagation：不仅调用原生的，还标记为“已停止传播”
	syntheticEvent.stopPropagation = () => {
		syntheticEvent.__stopPropagation = true;
		if (originStopPropagation) {
			originStopPropagation();
		}
	};

	return syntheticEvent;
}

// 收集从 targetElement 到 container 的所有事件处理函数（capture 和 bubble）
function collectPaths(
	targetElement: DOMElement,
	container: Container,
	eventType: string
) {
	const paths: Paths = {
		capture: [],
		bubble: []
	};

	while (targetElement && targetElement !== container) {
		const elementProps = targetElement[elementPropsKey];

		// 获取事件回调名：如 click -> ['onClickCapture', 'onClick']
		const callbackNameList = getEventCallbackNameFormEventType(eventType);
		if (callbackNameList) {
			callbackNameList.forEach((callbackName, i) => {
				const eventCallback = elementProps?.[callbackName];
				if (eventCallback) {
					// i==0 是 capture 阶段
					if (i === 0) {
						paths.capture.unshift(eventCallback); // 先执行祖先
					} else {
						paths.bubble.push(eventCallback); // 后执行后代
					}
				}
			});
		}

		// 继续向上
		targetElement = targetElement.parentNode as DOMElement;
	}

	return paths;
}

// 从事件名返回对应的 prop 回调名（支持 capture 与 bubble）
function getEventCallbackNameFormEventType(
	eventType: string
): string[] | undefined {
	return {
		click: ['onClickCapture', 'onClick']
	}[eventType];
}

// 事件类型转换为优先级
function eventTypeToSchedulerPriority(eventType: string) {
	switch (eventType) {
		case 'click':
		case 'keydown':
		case 'keyup':
			return unstable_ImmediatePriority;
		case 'scroll':
			return unstable_UserBlockingPriority;
		default:
			return unstable_NormalPriority;
	}
}
