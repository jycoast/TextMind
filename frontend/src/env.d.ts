/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*?worker" {
  const workerConstructor: {
    new (options?: { name?: string }): Worker;
  };
  export default workerConstructor;
}

declare module "*?worker&inline" {
  const workerConstructor: {
    new (options?: { name?: string }): Worker;
  };
  export default workerConstructor;
}
