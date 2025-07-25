import { HookDeps } from 'react-reconciler/src/fiberHooks';
import { Action, ReactContext, Usable } from 'shared/ReactTypes';

export interface Dispatcher {
	useState: <T>(initialState: () => T | T) => [T, Dispatch<T>];
	useEffect: (callback: () => void | void, deps: HookDeps | undefined) => void;
	useTransition: () => [boolean, (callback: () => null) => void];
	useRef: <T>(initialValue: T) => { current: T };
	useContext: <T>(context: ReactContext<T>) => T;
	use: <T>(usable: Usable<T>) => T;
	useMemo: <T>(nextCreate: () => T, deps: HookDeps | undefined) => T;
	useCallback: <T>(callback: T, deps: HookDeps | undefined) => T;
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
