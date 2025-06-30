import { WorkTag } from './workTags';
import { Props, Key, Ref } from 'shared/ReactTypes';
import { Flags, NoFlags } from './fiberFlags';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	alternate: FiberNode | null;
	flags: Flags;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// fiberNode实例
		this.tag = tag;
		this.key = key;
		// <div>
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

		// 双缓存
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
	}
}
