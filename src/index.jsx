import React from "react";

import "./styles.css";
import { PanelController } from "./controllers/PanelController.jsx";
import { CommandController } from "./controllers/CommandController.jsx";
import { About } from "./components/About.jsx";
// import { Demos } from "./panels/Demos.jsx";
// import { MoreDemos } from "./panels/MoreDemos.jsx";
// import { ApiDemos } from "./panels/ApiDemos.jsx";
// import { ThemePanel } from "./panels/ThemePanel.jsx";
import globalErrorHandler from "./utils/globalErrorHandler";
import { entrypoints } from "uxp";

import TodoList from "./panels-bak/TodoList.jsx";

// 初始化全局错误处理器
globalErrorHandler.initialize();

// 添加插件特定的错误监听器
globalErrorHandler.addErrorListener((error) => {
    console.log('插件错误监听器收到错误:', error);

    // 可以在这里添加错误上报逻辑
    // 例如发送到错误监控服务或显示用户通知
});

const aboutController = new CommandController(({ dialog }) => <About dialog={dialog} />, { id: "showAbout", title: "React Starter Plugin Demo", size: { width: 480, height: 480 } });
const todoListController = new PanelController(() => <TodoList/>, {
    id: "todoList",
    label: {
        default: "Todo List"
    },
    menuItems: [
        { id: "reload1", label: "Reload Plugin", enabled: true, checked: false, oninvoke: () => location.reload() },
        { id: "dialog1", label: "About this Plugin", enabled: true, checked: false, oninvoke: () => aboutController.run() },
    ]
});
// const apiDemosController = new PanelController(() => <ApiDemos />, {
//     id: "apiDemos", menuItems: [
//         { id: "reload3", label: "Reload Plugin", enabled: true, checked: false, oninvoke: () => location.reload() },
//         { id: "dialog3", label: "About this Plugin", enabled: true, checked: false, oninvoke: () => aboutController.run() },
//     ]
// });
// const moreDemosController = new PanelController(() => <MoreDemos />, {
//     id: "moreDemos", menuItems: [
//         { id: "reload2", label: "Reload Plugin", enabled: true, checked: false, oninvoke: () => location.reload() }
//     ]
// });
// const themePanelController = new PanelController(() => <ThemePanel />, {
//     id: "themePanel", menuItems: [
//         { id: "reload4", label: "Reload Plugin", enabled: true, checked: false, oninvoke: () => location.reload() },
//         { id: "dialog4", label: "About this Plugin", enabled: true, checked: false, oninvoke: () => aboutController.run() },
//     ]
// });

entrypoints.setup({
    plugin: {
        create(plugin) {
            /* optional */ console.log("created", plugin);
        },
        destroy() {
            /* optional */ console.log("destroyed");
            // 清理全局错误处理器
            globalErrorHandler.cleanup();
        }
    },
    commands: {
        showAbout: aboutController
    },
    panels: {
        todoList: todoListController,
        // apiDemos: apiDemosController,
        // moreDemos: moreDemosController,
        // themePanel: themePanelController
    }
});
