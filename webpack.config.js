const path = require("path");
const CleanWebpackPlugin = require("clean-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = (env, argv) => {
	const isProd = argv.mode === 'production';

	return {
		entry: './src/index.jsx',
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: 'index.js',
			//libraryTarget: "commonjs2"
		},
		// eval 在 UXP/XD 环境不可用，生产关闭 source map，开发用更快的 map
		devtool: isProd ? false : 'eval-cheap-module-source-map',
		externals: {
			uxp: 'commonjs2 uxp',
			photoshop: 'commonjs2 photoshop',
			os: 'commonjs2 os'
		},
		resolve: {
			extensions: [".js", ".jsx"]
		},
		module: {
			rules: [
				{
					test: /\.jsx?$/,
					exclude: /node_modules/,
					loader: "babel-loader",
					options: {
						plugins: [
							"@babel/transform-react-jsx",
							"@babel/proposal-object-rest-spread",
							"@babel/plugin-syntax-class-properties",
						]
					}
				},
				{
					test: /\.png$/,
					exclude: /node_modules/,
					loader: 'file-loader'
				},
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"]
				}
			]
		},
		optimization: {
			minimize: isProd,
			// 避免生成额外 chunk，确保仍输出单文件 index.js
			splitChunks: false,
			runtimeChunk: false,
			usedExports: true,
			concatenateModules: true,
			minimizer: isProd ? [
				new TerserPlugin({
					terserOptions: {
						compress: {
							// 保留所有console语句用于生产环境调试
							drop_console: true, // 保留console语句
							drop_debugger: true,
							passes: 2,
						},
						mangle: true,
						format: {
							comments: false,
						},
					},
					extractComments: false,
					parallel: true,
				})
			] : []
		},
		plugins: [
			//new CleanWebpackPlugin(),
			new CopyPlugin(['plugin'], {
				copyUnmodified: true
			})
		]
	};
};