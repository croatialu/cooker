import Store from "./Store";
import {
  isContainer,
  isDynamicInput,
  isDynamicOutput,
  isDynamicStore,
} from "./utils/utils";
import { path as Rpath } from "ramda";

import "./types/stateType";
import "./types/protocol";

interface DynamicFileInfo {
  scope: string;
  key: string;
  value: Protocol.DynamicField;
  dynamicKey: string;
}

class Node {
  input$: Store<StateType.Input$>;
  output$: Store<StateType.Output$>;
  protocol$: Store<StateType.Protocol$>;
  value$: Store<StateType.Value$>;
  dataSource$: Store<StateType.dataSource$>;
  store$: Store<StateType.Store$>;

  _dynamicFiledArr: Array<DynamicFileInfo> | null = null;

  _children: Node[] | null = null;
  _curTemplate: null | Protocol.Component | Protocol.Container = null;

  path: string[];

  constructor(
    path: string[],
    protocol$: Store<Protocol.Main>,
    value$: Store<StateType.Value$>,
    dataSource$: Store<StateType.dataSource$>,
    store$: Store<StateType.Store$>
  ) {
    this.path = path;
    this.protocol$ = protocol$;
    this.dataSource$ = dataSource$;
    this.store$ = store$;

    this.value$ = value$;

    this.input$ = new Store({});
    this.output$ = new Store(undefined as StateType.Output$);

    this.output$.subscribe((outputValue) => {
      if (!this.curTemplate || isContainer(this.curTemplate)) return;
      const { output } = this.curTemplate;

      if (isDynamicOutput(output)) {
        const curValue = this.value$.getValue();
        if (curValue[output.$output] !== outputValue) {
          this.value$.setValue({ ...curValue, [output.$output]: outputValue });
        }
      }

      if (isDynamicStore(output)) {
        const curStore = this.store$.getValue();
        if (curStore[output.$store] !== outputValue) {
          this.store$.setValue({ ...curStore, [output.$store]: outputValue });
        }
      }
    });

    this.store$.subscribe(() => {
      if (!this.curTemplate || isContainer(this.curTemplate)) return;
      const { input } = this.curTemplate;

      const realInput = this.getInput(input);

      this.input$.setValue(realInput);
    });

    this.value$.subscribe(() => {
      if (!this.curTemplate || isContainer(this.curTemplate)) return;
      const { input } = this.curTemplate;

      const realInput = this.getInput(input);
      this.input$.setValue(realInput);
    });
  }

  get dynamicFieldArr() {
    if (!this._dynamicFiledArr) {
      const currentTemplate = this.curTemplate;
      if (!currentTemplate) return null;
      if (isContainer(currentTemplate)) {
        // 暂时不考虑容器的动态字段
        return null;
      } else {
        const { input, output } = currentTemplate;
        const rules = [isDynamicInput, isDynamicOutput, isDynamicStore];

        const format = (params: any, scope: string) => {
          return Object.entries(params)
            .filter(([, value]) => rules.some((f) => f(value)))
            .map(([key, value]) => ({
              scope,
              key,
              value: value as Protocol.DynamicField,
              dynamicKey: Object.values(value as Protocol.DynamicField)[0],
            }));
        };
        const inputFiledArr = format(input, "input");
        const outputFiledArr = format({ output }, "output");

        const tempV = [...inputFiledArr, ...outputFiledArr];
        this._dynamicFiledArr = tempV.length ? tempV : null;
      }
    }

    return this._dynamicFiledArr;
  }

  get realPath() {
    return this.path
      .map((v) => [v, "children"])
      .flat()
      .slice(0, -1);
  }
  get curTemplate() {
    if (!this._curTemplate) {
      const protocol$ = this.protocol$;
      const protocol = protocol$.getValue();
      const currentTemplate = Rpath(this.realPath, protocol.content) as
        | null
        | Protocol.Component
        | Protocol.Container;
      this._curTemplate = currentTemplate;
    }
    return this._curTemplate;
  }

  getInput(input: StateType.Input$) {
    const [value, dataSource, store] = [
      this.value$,
      this.dataSource$,
      this.store$,
    ].map((v) => v.getValue());

    console.log(this.curTemplate?.name, { value, dataSource, store });
    const realInput = Object.entries(input).reduce((result, [k, v]) => {
      if (isDynamicInput(v)) {
        return {
          ...result,
          [k]: value[v.$input],
        };
      }

      if (isDynamicStore(v)) {
        return {
          ...result,
          [k]: store[v.$store],
        };
      }

      return {
        ...result,
        [k]: v,
      };
    }, {} as Record<string, any>);
    return realInput;
  }

  getChildren() {
    const value$ = this.value$;
    const protocol$ = this.protocol$;
    const dataSource$ = this.dataSource$;
    const store$ = this.store$;

    const currentTemplate = this.curTemplate;

    if (!currentTemplate) return null;
    if (isContainer(currentTemplate)) {
      const { children } = currentTemplate;

      return [...children].map((_, index) => {
        return new Node(
          [...this.path, index.toString()],
          protocol$,
          value$,
          dataSource$,
          store$
        );
      });
    } else {
      const { input } = currentTemplate;
      const realInput = this.getInput(input);

      this.input$ = new Store(realInput);
    }

    return null;
  }

  get children() {
    if (!this._children) {
      this._children = this.getChildren();
    }

    return this._children;
  }

  setOutput(value: any) {
    this.output$?.setValue(value);
  }

  subscribeValue(fn: (value: any) => void, watchKeys?: string[]) {
    return this.value$.subscribe(fn, watchKeys);
  }
}

class Cookerjs {
  protocol$: Store<StateType.Protocol$>;
  value$: Store<StateType.Value$>;
  dataSource$: Store<StateType.dataSource$>;

  store$: Store<StateType.Store$>;

  _children: Node[] | null = null;

  constructor(protocol: Protocol.Main, value: any, dataSource: any) {
    this.protocol$ = new Store(protocol);
    this.value$ = new Store(value);
    this.dataSource$ = new Store(dataSource);

    this.store$ = new Store({});
  }

  get children() {
    const { content } = this.protocol$.getValue();
    if (!this._children) {
      this._children = content.map((v, index) => {
        return new Node(
          [index.toString()],
          this.protocol$,
          this.value$,
          this.dataSource$,
          this.store$
        );
      });
    }

    return this._children;
  }

  subscribe(fn: (v: any) => void) {
    this.value$.subscribe(fn);
  }
}

export default Cookerjs;

export type Template = Protocol.Main;

export { isContainer, Node };
