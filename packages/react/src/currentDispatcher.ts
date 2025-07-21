import { Action } from 'shared/ReactTypes';

export interface Dispatcher {
	useState: <T>(initialState: () => T | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: any[] | void) => void;
	useTransition: () => [boolean, (callback: () => null) => void];
}

export type Dispatch<State> = (action: Action<State>) => void;

// 全局的dispatcher，用于在函数组件中调用hooks
const currentDispatcher: { current: Dispatcher | null } = {
	current: null
};

// 返回当前正在使用的dispatcher
export const resolveDispatcher = (): Dispatcher => {
	const dispatcher = currentDispatcher.current;
	if (dispatcher === null) {
		throw new Error('hooks只能在函数组件中调用');
	}
	return dispatcher;
};

export default currentDispatcher;
