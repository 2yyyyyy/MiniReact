export type Container = Element;
export type Instance = Element;
export type TextInstance = Text;

// export const createInstance = (type: string, props: any): Instance => {
export const createInstance = (type: string): Instance => {
	const element = document.createElement(type);
	return element;
};

export const appendInitialChild = (
	parent: Instance | Container,
	child: Instance
) => {
	parent.appendChild(child);
};

export const commitTextUpdate = (
	textInstance: TextInstance,
	content: string
) => {
	textInstance.textContent = content;
};

export const createTextInstance = (content: string) => {
	return document.createTextNode(content);
};

export const removeChild = (
	child: Instance | TextInstance,
	container: Container
) => {
	container.removeChild(child);
};

export const appendChildToContainer = appendInitialChild;
