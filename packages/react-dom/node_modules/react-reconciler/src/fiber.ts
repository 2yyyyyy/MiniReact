import {
	ContextProvider,
	Fragment,
	FunctionComponent,
	HostComponent,
	OffscreenComponent,
	SuspenseComponent,
	WorkTag
} from './workTags';
import { Props, Key, Ref, ReactElementType, Wakeable } from 'shared/ReactTypes';
import { Flags, NoFlags } from './fiberFlags';
import { Container } from 'hostConfig';
import { Lane, Lanes, NoLane, NoLanes } from './fiberLanes';
import { Effect } from './fiberHooks';
import { CallbackNode } from 'scheduler';
import { REACT_PROVIDER_TYPE, REACT_SUSPENSE_TYPE } from 'shared/ReactSymbols';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref | null;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	alternate: FiberNode | null;
	flags: Flags;
	subtreeFlags: Flags;
	updateQueue: unknown;
	deletions: FiberNode[] | null;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// fiberNode实例
		this.tag = tag;
		this.key = key || null;
		// <div>真是dom结点 类组件实例
		this.stateNode = null;
		// FunctionComponent () => {}
		this.type = null;

		// 构成树状结构
		this.return = null;
		// 子fiberNode
		this.child = null;
		// 兄弟fiberNode
		this.sibling = null;
		// 同级fiberNode 索引
		this.index = 0;
		this.ref = null;

		// 作为工作单元
		this.pendingProps = pendingProps;
		this.memoizedProps = null;
		this.memoizedState = null;
		this.updateQueue = null;

		// 双缓存
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
		this.subtreeFlags = NoFlags;
		this.deletions = null;
	}
}

export interface PendingPassiveEffects {
	// 有副作用的FiberNode
	unmount: Effect[];
	// 有副作用的FiberNode
	update: Effect[];
}

export interface OffscreenProps {
	mode: 'hidden' | 'visible';
	children: any;
}

export class FiberRootNode {
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;
	// 待处理的lane
	pendingLanes: Lanes;
	// 当前处理的lane
	finishedLane: Lane;
	// 待处理的副作用
	pendingPassiveEffects: PendingPassiveEffects;

	// 并发更新时回调
	callBackNode: CallbackNode | null;
	callBackPriority: Lane;

	pingCache: WeakMap<Wakeable<any>, Set<Lane>> | null;
	suspendedLanes: Lanes;
	pingLanes: Lanes;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;

		this.pendingLanes = NoLanes;
		this.suspendedLanes = NoLanes;
		this.pingLanes = NoLanes;

		this.finishedLane = NoLane;
		this.pendingPassiveEffects = {
			unmount: [],
			update: []
		};
		this.callBackNode = null;
		this.callBackPriority = NoLane;

		this.pingCache = null;
	}
}

// 创建工作单元 复用fiber时调用
export function createWorkInProgress(
	current: FiberNode,
	pendingProps: Props
): FiberNode {
	let wip = current.alternate;
	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;
		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
		wip.subtreeFlags = NoFlags;
		wip.deletions = null;
	}
	wip.type = current.type;
	wip.child = current.child;
	wip.updateQueue = current.updateQueue;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;
	wip.ref = current.ref;

	return wip;
}

// 根据reactElement创建fiberNode
export function createFiberFromElement(element: ReactElementType) {
	const { type, key, props, ref } = element;
	let fiberTag: WorkTag = FunctionComponent;
	if (typeof type === 'string') {
		// <div/>
		fiberTag = HostComponent;
	} else if (
		typeof type === 'object' &&
		type.$$typeof === REACT_PROVIDER_TYPE
	) {
		fiberTag = ContextProvider;
	} else if (type === REACT_SUSPENSE_TYPE) {
		fiberTag = SuspenseComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的type类型 ', element);
	}
	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	fiber.ref = ref;
	return fiber;
}

// 根据Fragment创建fiberNode
export function createFiberFromFragment(elements: any[], key: Key) {
	const fiber = new FiberNode(Fragment, elements, key);
	return fiber;
}

// 根据Offscreen创建fiberNode
export function createFiberFromOffscreen(pendingProps: OffscreenProps) {
	const fiber = new FiberNode(OffscreenComponent, pendingProps, null);
	return fiber;
}
