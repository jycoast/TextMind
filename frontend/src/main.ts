import { createApp } from "vue";
import { createPinia } from "pinia";
import { installMonacoEnvironment } from "@/monaco/env";
import App from "@/App.vue";
import "@/styles/base.css";

installMonacoEnvironment();

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
