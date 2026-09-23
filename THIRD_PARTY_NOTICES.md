# 第三方开源组件

公式排版使用 [MathJax 3](https://docs.mathjax.org/en/v3.2/)（Apache-2.0）；构建时使用 Sharp（Apache-2.0）将 SVG 转为透明图集。MathJax 输出为自包含路径，不使用操作系统字体来拼接公式。

网页中的公式图集内容与曲面向内输运思路改编自 [XboxNahida/ghostty-blackhole-main](https://github.com/XboxNahida/ghostty-blackhole-main) v3.0.0，原项目采用 MIT 许可证。发行文件中的 `licenses/ghostty-blackhole-MIT.txt` 保留完整许可文本。

网页使用 [Three.js](https://github.com/mrdoob/three.js) 构建独立的浏览器三维场景。此版本不是原 Windows 桌面捕获程序，也不是参考视频的原网站源码。网页采用参考图构图，自行实现七条带宽度和扭转的螺旋曲面、按曲面长度排版的公式、向内流动的公式点缀、近似弯曲光线积分、星空、相机交互与点击波纹。

参考视频用于视觉对照；参考网页的公开运行结果及结构用于分析。未整体复制其打包代码，也不将该参考网页宣称为 MIT 授权项目。
