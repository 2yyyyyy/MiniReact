import { FiberNode } from 'react-reconciler/src/fiber';
import { HostText } from 'react-reconciler/src/workTags';
import { Props } from 'shared/ReactTypes';

// HostRoot
export interface Container {
	rootID: number;
	children: (Instance | TextInstance)[];
}
// 元素节点 HostComponment
export interface Instance {
	id: number;
	type: string;
	children: (Instance | TextInstance)[];
	parent: number;
	props: Props;
}
// 文本节点 HostText
export interface TextInstance {
	text: string;
	id: number;
	parent: number;
}

// 实例计数器
let instanceCounter = 0;

// export const createInstance = (type: string, props: any): Instance => {
export const createInstance = (type: string, props: Props): Instance => {
	// const element = document.createElement(type) as unknown;
	// updateFiberProps(element as DOMElement, props);
	// return element as DOMElement;
	const instance = {
		id: instanceCounter++,
		type,
		children: [],
		parent: -1,
		props
	};

	return instance;
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	// id
	const prevParentID = child.parent;
	const parentID = 'rootID' in parent ? parent.rootID : parent.id;
	if (prevParentID !== -1 && prevParentID !== parentID) {
		throw new Error('不能重复挂载child');
	}
	child.parent = parentID;
	parent.children.push(child);
};

export const createTextInstance = (content: string): TextInstance => {
	const instance = {
		id: instanceCounter++,
		text: content,
		parent: -1
	};
	return instance;
};

export const appendChildToContainer = (parent: Container, child: Instance) => {
	// id
	const prevParentID = child.parent;
	if (prevParentID !== -1 && prevParentID !== parent.rootID) {
		throw new Error('不能重复挂载child');
	}
	child.parent = parent.rootID;
	parent.children.push(child);
};

export function commitUpdate(fiber: FiberNode) {
	switch (fiber.tag) {
		case HostText:
			const text = fiber.memoizedProps?.content;
			return commitTextUpdate(fiber.stateNode, text);
		default:
			if (__DEV__) {
				console.warn('未实现的commitUpdate类型', fiber);
			}
			break;
	}
}

export const commitTextUpdate = (
	textInstance: TextInstance,
	content: string
) => {
	textInstance.text = content;
};

export const removeChild = (
	child: Instance | TextInstance,
	container: Container
) => {
	const index = container.children.indexOf(child);
	if (index === -1) {
		throw new Error('要删除的child不存在');
	}
	container.children.splice(index, 1);
};

export function insertChildToContainer(
	child: Instance,
	container: Container,
	before: Instance
) {
	const beforeIndex = container.children.indexOf(before);
	if (beforeIndex === -1) {
		throw new Error('要插入的before不存在');
	}
	const index = container.children.indexOf(child);
	if (index !== -1) {
		container.children.splice(index, 1);
	}
	container.children.splice(beforeIndex, 0, child);
}

export const scheduleMictask =
	typeof queueMicrotask === 'function'
		? queueMicrotask
		: typeof Promise === 'function'
		? (callback: (...args: any) => void) => Promise.resolve(null).then(callback)
		: setTimeout;
