import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import ReactCurrentBatchConfig from './src/currentBatchConfig';
import { jsxDEV, jsx, isValidElement as isValiElementFn } from './src/jsx';

export { createContext } from './src/context';
export { memo } from './src/memo';

export { REACT_SUSPENSE_TYPE as Suspense } from 'shared/ReactSymbols';

export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

export const useRef: Dispatcher['useRef'] = (initialValue) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useRef(initialValue);
};

export const useContext: Dispatcher['useContext'] = (context) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useContext(context);
};

export const use: Dispatcher['use'] = (usable) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.use(usable);
};

export const useMemo: Dispatcher['useMemo'] = (nextCreate, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useMemo(nextCreate, deps);
};

export const useCallback: Dispatcher['useCallback'] = (callback, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useCallback(callback, deps);
};

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	ReactCurrentBatchConfig
};

export const version = '0.0.0';
// export const createElement = jsxDEV;

// TODO 这里需要根据环境变量来判断是否使用jsxDEV
export const createElement = jsx;

export const isValidElement = isValiElementFn;

// export default {
// 	version: '0.0.0',
// 	createElement: jsxDEV
// };
