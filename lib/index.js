const initialToken = {
    type: 'source',
    value: '',
    args: {},
    pipes: [],
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getTokens(input) {
    const tokens = []
    let cur = 0
    let token = clone(initialToken)
    while(cur < input.length) {
        let char = input[cur]
        // 解析 @[module(key='value')]
        if (char === '@' && input[cur + 1] === '[') {
            let str = ''
            char = input[++cur] // 当前 char: '['
            while(char !== ']' && cur < input.length) {
                char = input[++cur]
                if (char === '\'') {
                    // 归一化引号，便于格式化
                    char = '"'
                }
                str += char
            }
            // str 归一化为小写, 去掉结尾的 ']'
            str = str.toLocaleLowerCase().slice(0, -1)
            // 设置上一个 module 的 token, 并且重置数据
            tokens.push(token)
            token = clone(initialToken)

            // str: MODULE(agrs='value')
            const m = str.split(/\(|\)/).map(x => x.trim()).filter(Boolean)
            token.type = m[0]

            // 判断是否存在 args
            if (m[1]) {
                const s = m[1].split(/\,|=/).map(x => x.trim()).filter(Boolean)
                for (let i = 0; i < s.length; i += 2) {
                    const key = s[i];
                    const value = JSON.parse(s[i + 1])
                    token.args[key] = value
                }
            }
            cur++ // 跳过结尾的 ']'
            continue            
        }
        // 解析 |> 操作符
        if (char === '|' && input[cur + 1] === '>') {
            let str = ''
            cur += 2
            char = input[cur] // 当前 char: '>' + 1
            // 跳过空白字符
            while(char.match(/\s/) && cur < input.length) {
                char = input[++cur]
            }
            let deep = 0
            // 匹配管道操作符
            while((deep || !char.match(/\s/)) && cur < input.length) {
                str += char
                // 判断括号是否匹配完成
                if (char.match(/\(|\[|\{/)) {
                    deep++
                }
                if (char.match(/\)|\]|\}/)) {
                    deep--
                }
                char = input[++cur]
            }
            token.pipes.push(str)
            continue
        }
        token.value += char
        cur++
    }
    tokens.push(token)
    return tokens
}

const REX_COMPONENT = '__REX_COMPONENT__'
const REX_STYLES = '__REX_STYLES__'

function parseTokens(tokens) {
    let component = ''
    let componentPipes = []
    let renders = ''
    let source = ''
    let styles = ''
    let hasDefaultRender = false
    let hasDefaultExport = true
    for (const token of tokens) {
        if (token.type === 'source') {
            // 设置 source code
            source += token.value
            if (token.value.includes('export default')) {
                hasDefaultExport = false
            }
        }
        if (token.type === 'component') {
            // 设置 component code
            component = token.value
            // 获取 component 设置的 pipes
            componentPipes = token.pipes
        }
        if (token.type === 'render') {
            // 设置基本的 render code
            let render = `
                <React.Fragment>
                    ${token.value}
                    <style jsx>{\`${REX_STYLES}\`}</style>
                </React.Fragment>
            `
            // 判断是否设置了 pipes
            if (token.pipes.length === 0) {
                hasDefaultRender = true
                // 如果没有 pipes 则默认直接 return render
                render = `return (${render})`
            } else {
                // 解析并设置 render 的 pipes
                for (const pipe of token.pipes) {
                    render = `${pipe}(${render})`
                }
            }
            // 稍微使生成的代码好看一点点
            render = `\n${render}\n`
            renders += render
        }
        if (token.type === 'style') {
            // 设置 styles code
            styles += token.value
        }
    }
    // 全局替换 __REX_STYLES__ 占位符
    renders = renders.replace(/__REX_STYLES__/g, styles)
    
    // 设置组件的 func 模版
    const func = `function ${REX_COMPONENT}() {
        ${component}
        ${hasDefaultRender ? renders : 'return null'}
    }`

    // 如果没有 export default，则设置默认导出为当前组件
    if (hasDefaultExport) {
        source += `\n export default ${REX_COMPONENT}\n`
    }
    return source + func
}

module.exports = function(source) {
    // 只处理 rex 后缀的文件
    if (!this.resourcePath.endsWith('.rex')) {
        return source
    }
    const tokens = getTokens(source)
    const parsedSource = parseTokens(tokens)
    return parsedSource
};