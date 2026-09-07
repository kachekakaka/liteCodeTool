/** 前端启动入口：挂载 Vue 应用、全局样式和统一资源路由。 */
import { createApp } from 'vue';
import App from './App.vue';
import './styles/index.css';
import { router } from './router/index.ts';
createApp(App).use(router).mount('#app');
