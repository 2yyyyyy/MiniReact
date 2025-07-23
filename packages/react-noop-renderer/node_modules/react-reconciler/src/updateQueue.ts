import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { isSubsetOfLanes, Lane, NoLane } from './fiberLanes';

// Update接口表示一个待应用的更新操作
export interface Update<State> {
	action: Action<State>; // 要执行的更新动作，可以是新状态值或函数
	next: Update<any> | null;
	lane: Lane;
}
// UpdateQueue接口表示一个更新队列
export interface UpdateQueue<State> {
	// 共享的待处理更新。使用共享结构允许多个引用指向同一个更新队列
	shared: {
		pending: Update<State> | null; // 指向最后一个待处理的更新
	};
	dispatch: Dispatch<State> | null;
}
// 创建一个新的Update对象
export const createUpdate = <State>(
	action: Action<State>,
	lane: Lane
): Update<State> => {
	return {
		action,
		lane,
		next: null
	};
};

// 创建一个新的UpdateQueue对象
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		},
		dispatch: null
	} as UpdateQueue<State>;
};

// 将更新添加到队列中
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	const pending = updateQueue.shared.pending;
	if (pending === null) {
		update.next = update;
	} else {
		update.next = pending.next;
		pending.next = update;
	}

	updateQueue.shared.pending = update;
};

// 处理更新队列并生成新的状态
/**
新增baseState、baseQueue字段:
1.baseState是本次更新参与计算的初始state，memoizedState是上次更新计算的最终state
2.如果本次更新没有update被跳过，则下次更新开始时baseState === memoizedState
3.如果本次更新有update被跳过，则本次更新计算出的memoizedState为「考虑优先级」情况下计算的结果，
  baseState为「最后一个没被跳过的update计算后的结果」，下次更新开始时baseState！==memoizedState
4.本次更新「被跳过的update及其后面的所有update」都会被保存在baseQueue中参与下次state计算
5.本次更新「参与计算但保存在baseQueue中的update」，优先级会降低到NoLane
example:
	u1
	{
		action: num => num + 1
		lane: DefaultLane
	}
	u2
	{
		action: 3
		lane: Synclane
	}
	u3
	{
		action: num => num + 3
		lane: DefaultLane
	}
	第一次render
	baseState = 0; memorizedState = 0;
	baseQueue = null; updateLane = DefaultLane;
	第一次render 第一次计算
	baseState = 0; memorizedState = 1;
	baseQueue = null;
	第一次render 第二次计算(u2 被跳过)
	baseState = 1; memorizedState = 1;
	baseQueue = u2;
	第一次render 第三次计算
	baseState = 1; memorizedState = 11;
	baseQueue = u2 -> u3(NoLane);

	第二次render
	baseState = 1; memorizedState = 11;
	baseQueue = u2 -> u3(NoLane); updateLane = Synclane;
	第二次render 第一次计算
	baseState = 3; memorizedState = 3;
	第二次render 第二次计算
	baseState = 13; memorizedState = 13;
 */
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): {
	memoizedState: State;
	baseState: State;
	baseQueue: Update<State> | null;
} => {
	// 初始化结果对象，默认使用baseState
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState,
		baseState,
		baseQueue: null
	};

	if (pendingUpdate !== null) {
		// 第一个update
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;

		let newBaseState = baseState;
		let newBaseQueueFirst: Update<State> | null = null;
		let newBaseQueueLast: Update<State> | null = null;
		let newState = baseState;

		do {
			const updateLane = pending.lane;
			if (!isSubsetOfLanes(renderLane, updateLane)) {
				// 优先级不够 被跳过
				const clone = createUpdate(pending.action, pending.lane);
				// 是不是第一个被跳过的
				if (newBaseQueueFirst === null) {
					newBaseQueueFirst = clone;
					newBaseQueueLast = clone;
					newBaseState = newState;
				} else {
					(newBaseQueueLast as Update<State>).next = clone;
					newBaseQueueLast = clone;
				}
			} else {
				if (newBaseQueueLast !== null) {
					const clone = createUpdate(pending.action, NoLane);
					newBaseQueueLast.next = clone;
					newBaseQueueLast = clone;
				}
				const action = pending.action;
				if (action instanceof Function) {
					newState = action(baseState);
				} else {
					newState = action;
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);

		if (newBaseQueueLast === null) {
			// 本次计算没有update被跳过
			newBaseState = newState;
		} else {
			// 合成环状链表
			newBaseQueueLast.next = newBaseQueueFirst;
		}
		result.memoizedState = newState;
		result.baseState = newBaseState;
		result.baseQueue = newBaseQueueLast;
	}
	return result;
};
