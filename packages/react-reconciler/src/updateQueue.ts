import { Action } from 'shared/ReactTypes';

// Update接口表示一个待应用的更新操作
export interface Update<State> {
	action: Action<State>; // 要执行的更新动作，可以是新状态值或函数
}
// UpdateQueue接口表示一个更新队列
export interface UpdateQueue<State> {
	// 共享的待处理更新。使用共享结构允许多个引用指向同一个更新队列
	shared: {
		pending: Update<State> | null; // 指向最后一个待处理的更新
	};
}
// 创建一个新的Update对象
export const createUpdate = <State>(action: Action<State>) => {
	return {
		action
	};
};

// 创建一个新的UpdateQueue对象
export const createUpdateQueue = <State>() => {
	return {
		shared: {
			pending: null
		}
	} as UpdateQueue<State>;
};

// 将更新添加到队列中
export const enqueueUpdate = <State>(
	updateQueue: UpdateQueue<State>,
	update: Update<State>
) => {
	updateQueue.shared.pending = update;
};

// 处理更新队列并生成新的状态
export const processUpdateQueue = <State>(
	baseState: State,
	pendingUpdate: Update<State> | null
): { memoizedState: State } => {
	// 初始化结果对象，默认使用baseState
	const result: ReturnType<typeof processUpdateQueue<State>> = {
		memoizedState: baseState
	};
	if (pendingUpdate !== null) {
		const action = pendingUpdate.action;
		if (action instanceof Function) {
			result.memoizedState = action(baseState);
		} else {
			result.memoizedState = action;
		}
	}

	return result;
};
