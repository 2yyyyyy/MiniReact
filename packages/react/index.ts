import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { jsxDEV, jsx, isValidElement as isValiElementFn } from './src/jsx';

export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
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
