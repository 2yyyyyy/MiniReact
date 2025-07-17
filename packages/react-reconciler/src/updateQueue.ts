import { Dispatch } from 'react/src/currentDispatcher';
import { Action } from 'shared/ReactTypes';
import { Lane } from './fiberLanes';

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
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null,
	renderLane: Lane
): { memoizedState: State } => {
	// 初始化结果对象，默认使用baseState
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};

	if (pendingUpdate !== null) {
		const first = pendingUpdate.next;
		let pending = pendingUpdate.next as Update<any>;
		do {
			const updateLane = pending.lane;
			if (updateLane === renderLane) {
				const action = pendingUpdate.action;
				if (action instanceof Function) {
					baseState = action(baseState);
				} else {
					baseState = action;
				}
			} else {
				if (__DEV__) {
					console.log('不应该updateLane !== renderLane');
				}
			}
			pending = pending.next as Update<any>;
		} while (pending !== first);
	}
	result.memoizedState = baseState;
	return result;
};
