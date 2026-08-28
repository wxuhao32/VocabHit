/* ============================================================
   考研词书释义分级 · 人工标注数据（第一批）
   ------------------------------------------------------------
   - 由人工逐条审视考研词书数据后标注，覆盖运行时直接读取，
     ky-level.js 命中本表即返回人工结果（不再走算法）。
   - 数据格式与 kyLevel 返回同构：每词 = [{pos, meanings:[
       [text, level, obscure]  ]}]
     · level: "common"|"normal"|"rare"（绿 / 黄 / 灰）
     · obscure: 1 = 考研熟词僻义（释义右上角小「僻」字）
   - 判断口径（人工）：
     · common = 该词最常见、最基础、日常/考研最通用的释义
     · normal = 有一定使用频率，但非最核心
     · rare   = 少见、生僻、冷门（专业/方言/罕见用法）
     · obscure(僻) = 词本身高频，但该义与常见义明显不同、
                     且考研阅读可能考察的特殊词义（严格保守，宁少勿滥）
   ============================================================ */
window.KY_MANUAL = {
  "get": [
    { pos: "vt.", meanings: [["得到", "common", 0], ["抓住", "common", 0], ["说服", "normal", 0], ["受到（惩罚等）", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["到达", "common", 0], ["来", "common", 0]] },
    { pos: "vi.", meanings: [["成为", "normal", 0], ["开始", "normal", 0], ["设法对付", "normal", 0], ["获得利益或财富", "normal", 0]] },
    { pos: "n.", meanings: [["生殖", "rare", 0], ["幼兽", "rare", 0], ["赢利", "rare", 1]] }
  ],
  "take": [
    { pos: "vt.", meanings: [["拿", "common", 0], ["取", "common", 0], ["采取", "common", 0], ["接受（礼物等）", "common", 0], ["耗费（时间等）", "normal", 0]] },
    { pos: "vi.", meanings: [["拿", "common", 0], ["获得", "common", 0]] },
    { pos: "n.", meanings: [["镜头", "rare", 0], ["看法", "rare", 0], ["收入额", "rare", 1], ["场景", "rare", 0]] }
  ],
  "set": [
    { pos: "vt.", meanings: [["放置", "common", 0], ["安置", "common", 0], ["使处于某种状况", "common", 0], ["设置", "common", 0], ["摆放餐具", "normal", 0]] },
    { pos: "vi.", meanings: [["落山", "normal", 0], ["出发", "normal", 0], ["凝结", "normal", 0]] },
    { pos: "n.", meanings: [["一套", "common", 0], ["一副", "normal", 0], ["集合", "normal", 0], ["布景", "normal", 0], ["电视机", "normal", 0]] },
    { pos: "adj.", meanings: [["固定的", "normal", 0], ["位于…的", "normal", 0], ["顽固的", "rare", 0], ["安排好的", "normal", 0]] }
  ],
  "put": [
    { pos: "vt.", meanings: [["放", "common", 0], ["表达", "normal", 0], ["给予（重视、信任、价值等）", "normal", 0], ["使处于（某种状态）", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["使感觉到", "normal", 0], ["使受到…的影响", "normal", 0]] },
    { pos: "vi.", meanings: [["说", "normal", 0], ["猛推", "rare", 0], ["将…送往", "normal", 0], ["使与…连接", "normal", 0]] },
    { pos: "n.", meanings: [["[方]笨蛋", "rare", 0], ["怪人", "rare", 0], ["对策", "rare", 0]] },
    { pos: "adj.", meanings: [["固定的", "normal", 0], ["不动的", "normal", 0]] }
  ],
  "work": [
    { pos: "vt. & vi.", meanings: [["使工作", "common", 0], ["使运作", "common", 0], ["操作", "normal", 0], ["使产生效果", "normal", 0]] },
    { pos: "n.", meanings: [["工作", "common", 0], ["操作", "normal", 0], ["著作", "normal", 0], ["工厂", "normal", 0], ["行为", "normal", 0], ["事业", "normal", 0]] },
    { pos: "vt.", meanings: [["使工作", "normal", 0], ["操作", "normal", 0], ["经营", "normal", 0], ["使缓慢前进", "rare", 0]] }
  ],
  "state": [
    { pos: "n.", meanings: [["国家", "common", 0], ["州", "common", 0], ["状况", "common", 0], ["情况", "common", 0], ["资格", "rare", 0]] },
    { pos: "vt.", meanings: [["规定", "normal", 0], ["陈述", "normal", 0], ["声明", "normal", 0]] },
    { pos: "adj.", meanings: [["国家的", "normal", 0], ["国务的", "normal", 0], ["公务的", "normal", 0], ["正式的", "normal", 0]] }
  ],
  "book": [
    { pos: "n.", meanings: [["书", "common", 0], ["卷", "normal", 0], ["课本", "common", 0], ["账簿", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["预订", "common", 0]] },
    { pos: "vt.", meanings: [["登记", "normal", 0], ["（向旅馆、饭店、戏院等）预约", "normal", 0], ["立案（控告某人）", "rare", 1], ["订立演出契约", "rare", 0]] },
    { pos: "adj.", meanings: [["书的", "normal", 0], ["账簿上的", "normal", 0], ["得之（或来自）书本的", "rare", 0], ["按照（或依据）书本的", "rare", 0]] }
  ],
  "bank": [
    { pos: "n.", meanings: [["银行", "common", 0], ["（条形的）堆", "normal", 0], ["（河的）岸", "common", 0], ["库存", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["堆积", "normal", 0], ["筑（堤）", "normal", 0], ["将（钱）存入银行", "normal", 0]] },
    { pos: "vi.", meanings: [["（转弯时）倾斜飞行", "rare", 1], ["（在某银行）开账户", "normal", 0], ["存款", "normal", 0]] },
    { pos: "vt.", meanings: [["（用煤等）封炉火", "rare", 0]] }
  ],
  "spring": [
    { pos: "n.", meanings: [["春季", "common", 0], ["泉水", "normal", 1], ["小溪", "rare", 0], ["弹簧", "normal", 0], ["弹性", "normal", 0], ["跳跃", "normal", 0]] },
    { pos: "vi.", meanings: [["跳", "common", 0], ["跃", "normal", 0], ["突然发出或出现", "normal", 0], ["发源", "normal", 0], ["劈开", "rare", 0], ["裂开", "rare", 0]] },
    { pos: "vt.", meanings: [["突然跳出", "normal", 0], ["跳过", "normal", 0], ["使开裂", "rare", 0]] },
    { pos: "adj.", meanings: [["春天的", "normal", 0], ["弹簧的", "rare", 0], ["有弹性的", "rare", 0]] }
  ],
  "minute": [
    { pos: "n.", meanings: [["分", "common", 0], ["分钟", "common", 0], ["瞬间", "normal", 0], ["片刻", "normal", 0], ["备忘录", "rare", 0], ["会议记录", "rare", 1]] },
    { pos: "vt.", meanings: [["把…记录在案", "rare", 0], ["为…测定时间", "rare", 0]] }
  ],
  "season": [
    { pos: "n.", meanings: [["季节", "common", 0], ["季", "normal", 0], ["时期", "normal", 0], ["活动期", "normal", 0], ["时令", "normal", 0], ["暂时", "rare", 0]] },
    { pos: "vt.", meanings: [["使适应", "rare", 0], ["使适用", "rare", 0], ["调味", "normal", 1]] },
    { pos: "vt. & vi.", meanings: [["使变干燥", "rare", 0]] }
  ],
  "mean": [
    { pos: "v.", meanings: [["表示…的意思", "common", 0], ["意思是", "common", 0], ["打算", "common", 0], ["产生…结果", "normal", 0]] },
    { pos: "adj.", meanings: [["吝啬的", "normal", 0], ["刻薄的", "normal", 0], ["破旧的", "rare", 0], ["残忍的", "normal", 0]] },
    { pos: "n.", meanings: [["平均数", "normal", 0], ["中间", "rare", 0], ["几何平均", "rare", 0], ["等比中数", "rare", 0]] }
  ],
  "plain": [
    { pos: "n.", meanings: [["平原", "normal", 0], ["平地", "normal", 0], ["[纺织业]平针", "rare", 0], ["朴实无华的东西", "rare", 0]] },
    { pos: "adj.", meanings: [["平的", "normal", 0], ["素的", "normal", 0], ["清晰的", "common", 0], ["相貌平平的", "normal", 0]] },
    { pos: "adv.", meanings: [["清楚地", "normal", 0], ["明白地", "normal", 0], ["平易地", "normal", 0], ["[用以加强语气]显然", "rare", 0], ["完全地", "rare", 0]] },
    { pos: "vi.", meanings: [["发牢骚", "rare", 0], ["诉苦", "rare", 0]] }
  ],
  "want": [
    { pos: "v.", meanings: [["想要", "common", 0], ["希望", "common", 0], ["打算", "normal", 0], ["需要…在场", "normal", 0]] },
    { pos: "n.", meanings: [["需要的东西", "normal", 0], ["缺少", "normal", 1], ["贫穷", "rare", 0]] }
  ],
  "concern": [
    { pos: "vt.", meanings: [["涉及", "common", 0], ["关系到", "common", 0], ["使关心", "normal", 0], ["使担忧", "normal", 0], ["参与", "normal", 0]] },
    { pos: "n.", meanings: [["关心", "normal", 0], ["关系", "normal", 0], ["有关", "normal", 0], ["顾虑", "normal", 0], ["公司或企业", "rare", 1]] }
  ],
  "measure": [
    { pos: "n.", meanings: [["测量", "normal", 0], ["测度", "rare", 0], ["措施", "normal", 0], ["程度", "normal", 0], ["尺寸", "normal", 0]] },
    { pos: "vt.", meanings: [["测量", "common", 0], ["估量", "normal", 0]] },
    { pos: "vi.", meanings: [["测量", "common", 0], ["测量（大小", "normal", 0], ["容量", "normal", 0], ["尺寸等）", "normal", 0]] }
  ],
  "issue": [
    { pos: "n.", meanings: [["问题", "common", 0], ["（报刊的）期", "normal", 0], ["号", "normal", 0], ["发行物", "normal", 0], ["流出", "rare", 0]] },
    { pos: "vt.", meanings: [["发行", "normal", 0], ["发布", "normal", 0], ["流出", "rare", 0]] },
    { pos: "vi.", meanings: [["发行", "normal", 0], ["造成…结果", "rare", 0], ["在…上挑起争论", "rare", 0]] }
  ],
  "account": [
    { pos: "n.", meanings: [["账", "normal", 0], ["账目", "normal", 0], ["存款", "normal", 0], ["记述", "normal", 0], ["报告", "normal", 0], ["理由", "normal", 0]] },
    { pos: "vi.", meanings: [["解释", "normal", 0], ["导致", "normal", 0], ["报账", "rare", 0]] },
    { pos: "vt.", meanings: [["认为", "rare", 0], ["把…视作", "rare", 0]] }
  ],
  "order": [
    { pos: "n.", meanings: [["命令", "normal", 0], ["秩序", "common", 0], ["规则", "normal", 0], ["制度", "normal", 0], ["次序", "normal", 0]] },
    { pos: "vt.", meanings: [["命令", "common", 0], ["订购", "normal", 0], ["整理", "normal", 0]] },
    { pos: "vi.", meanings: [["下订单", "normal", 0]] }
  ],
  "company": [
    { pos: "n.", meanings: [["公司", "common", 0], ["商号", "normal", 0], ["作伴", "normal", 1], ["伴侣", "normal", 0], ["客人", "rare", 0], ["连队", "normal", 0], ["中队", "rare", 0], ["（社交）集会", "normal", 0], ["聚会", "normal", 0]] }
  ],
  "article": [
    { pos: "n.", meanings: [["（报章杂志中的）文章", "common", 0], ["论文", "normal", 0], ["条款", "normal", 0], ["物品", "normal", 0], ["[语] 冠词", "normal", 0]] },
    { pos: "vt.", meanings: [["使受协议条款的约束", "rare", 0], ["以协议（或契约）约束", "rare", 0], ["订约将…收为学徒（或徒弟）", "rare", 0], ["定约雇用", "rare", 0]] },
    { pos: "vi.", meanings: [["进行控告", "rare", 0], ["提出罪状（或指责）(against)", "rare", 0], ["签订协议", "rare", 0]] }
  ],
  "interest": [
    { pos: "n.", meanings: [["兴趣", "common", 0], ["爱好", "normal", 0], ["利害关系", "normal", 0], ["利益", "normal", 0], ["利息", "normal", 0], ["趣味", "normal", 0], ["感兴趣的事", "normal", 0]] },
    { pos: "vt.", meanings: [["使产生兴趣", "common", 0], ["使参与", "normal", 0], ["使加入", "normal", 0], ["引起…的意愿", "rare", 0], ["使产生关系", "rare", 0]] }
  ],
  "rest": [
    { pos: "n.", meanings: [["休息", "common", 0], ["剩余部分", "normal", 0], ["支持物", "rare", 0], ["宁静", "normal", 0], ["安宁", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["（使）休息", "common", 0], ["（使）倚靠[支撑]", "normal", 0]] },
    { pos: "vi.", meanings: [["休息", "common", 0], ["静止", "normal", 0], ["停止", "normal", 0], ["安心", "normal", 0]] },
    { pos: "vt.", meanings: [["使休息", "normal", 0], ["使轻松", "normal", 0], ["使长眠", "rare", 0], ["使依赖", "normal", 0]] }
  ],
  "right": [
    { pos: "adv.", meanings: [["立刻", "normal", 0], ["马上", "normal", 0], ["向右", "common", 0], ["右边", "common", 0], ["恰当地", "normal", 0], ["一直", "normal", 0]] },
    { pos: "adj.", meanings: [["右方的", "common", 0], ["正确的", "common", 0], ["合适的", "normal", 0], ["好的", "normal", 0], ["正常的", "normal", 0]] },
    { pos: "n.", meanings: [["正确", "normal", 0], ["正当", "normal", 0], ["右边", "common", 0], ["权利", "common", 0], ["右手", "normal", 0]] },
    { pos: "vt.", meanings: [["纠正", "normal", 0], ["扶直", "rare", 0], ["使正", "normal", 0], ["整理", "normal", 0], ["补偿", "normal", 0]] },
    { pos: "vi.", meanings: [["（船舶等）复正", "rare", 0], ["恢复平稳", "rare", 0]] }
  ],
  "race": [
    { pos: "n.", meanings: [["赛跑", "common", 0], ["人种", "common", 0], ["竞争", "normal", 0], ["民族", "normal", 0]] },
    { pos: "v.", meanings: [["参加比赛", "common", 0], ["快速移动", "normal", 0], ["空转", "rare", 0]] }
  ],
  "game": [
    { pos: "n.", meanings: [["游戏", "common", 0], ["运动", "normal", 0], ["比赛", "normal", 0], ["竞赛", "normal", 0], ["诡计", "rare", 0], ["猎物", "rare", 1]] },
    { pos: "adj.", meanings: [["受伤的", "rare", 0], ["瘸的", "rare", 0], ["对…有兴趣的", "rare", 0], ["雄赳赳的", "rare", 0], ["关于野味的", "rare", 0]] },
    { pos: "v.", meanings: [["打赌", "rare", 0], ["赌输赢", "rare", 0], ["赌输", "rare", 0]] }
  ],
  "kind": [
    { pos: "n.", meanings: [["〈古〉方式", "rare", 0], ["方法", "rare", 0], ["本质", "normal", 0], ["天性", "normal", 0], ["同类", "normal", 0], ["某类", "normal", 0]] },
    { pos: "adj.", meanings: [["仁慈的", "common", 0], ["体贴的", "common", 0], ["友善的", "common", 0], ["好心的", "common", 0], ["温和", "normal", 0], ["宽宏大量的", "normal", 0]] }
  ],
  "fit": [
    { pos: "vt. & vi.", meanings: [["（使）适合", "common", 0], ["安装", "normal", 0], ["合身", "common", 0]] },
    { pos: "adj.", meanings: [["合适的", "common", 0], ["恰当的", "normal", 0], ["合身的", "common", 0], ["健壮的", "normal", 0]] },
    { pos: "n.", meanings: [["合身", "normal", 0], ["适合", "normal", 0], ["匹配", "normal", 0], ["发作", "normal", 1]] }
  ],
  "make": [
    { pos: "vt.", meanings: [["做", "common", 0], ["制造", "common", 0], ["生产", "common", 0], ["制定", "normal", 0], ["使成为", "normal", 0], ["使产生", "normal", 0]] },
    { pos: "vi.", meanings: [["开始", "rare", 0], ["尝试", "rare", 0], ["行进", "rare", 0], ["增大", "rare", 0]] },
    { pos: "n.", meanings: [["制造", "normal", 0], ["生产量", "rare", 0], ["性格", "rare", 0], ["形状", "rare", 0], ["样式", "rare", 0]] }
  ],
  "give": [
    { pos: "vt. & vi.", meanings: [["给予", "common", 0], ["赠送", "common", 0], ["作出", "common", 0]] },
    { pos: "vt.", meanings: [["供给", "common", 0], ["产生", "common", 0], ["举办", "normal", 0], ["（为购买某物或做某事而）支付", "normal", 0]] },
    { pos: "vi.", meanings: [["（物体）塌下", "rare", 0], ["让步", "normal", 0]] },
    { pos: "n.", meanings: [["伸展性", "rare", 0], ["弹性", "rare", 0]] }
  ],
  "keep": [
    { pos: "vt.", meanings: [["保持", "common", 0], ["保留", "common", 0], ["遵守", "common", 0], ["阻止", "normal", 0]] },
    { pos: "vi.", meanings: [["（食品）保持新", "normal", 0], ["保持健康", "normal", 0]] },
    { pos: "n.", meanings: [["保持", "rare", 0], ["保养", "rare", 0], ["供养", "rare", 0], ["抚养", "rare", 0], ["生活", "rare", 0], ["生计", "rare", 1], ["饲料", "rare", 0], ["牧草", "rare", 0]] }
  ],
  "hold": [
    { pos: "vt.", meanings: [["拿住", "common", 0], ["握住", "common", 0], ["保留", "common", 0], ["保存", "common", 0], ["扣留", "normal", 0], ["拘押", "normal", 0], ["容纳", "normal", 0]] },
    { pos: "vi.", meanings: [["拿住", "common", 0], ["握住", "common", 0], ["同意", "normal", 0], ["赞成", "normal", 0], ["保持不变", "normal", 0], ["有效", "normal", 0]] },
    { pos: "n.", meanings: [["握住", "common", 0], ["保留", "normal", 0], ["控制", "normal", 0]] }
  ],
  "bring": [
    { pos: "vt.", meanings: [["带来", "common", 0], ["引来", "common", 0], ["促使", "common", 0], ["引起", "common", 0], ["提供", "normal", 0], ["导致", "normal", 0]] }
  ],
  "call": [
    { pos: "v.", meanings: [["呼唤", "common", 0], ["喊叫", "common", 0], ["召唤", "common", 0], ["叫来", "common", 0], ["召集", "normal", 0], ["下令", "normal", 0], ["命令", "normal", 0], ["打电话给", "common", 0]] },
    { pos: "n.", meanings: [["喊叫", "common", 0], ["大声喊", "common", 0], ["电话联络", "normal", 0], ["必要", "normal", 0], ["理由", "rare", 0], ["要求", "normal", 0]] }
  ],
  "come": [
    { pos: "vi.", meanings: [["来", "common", 0], ["开始", "common", 0], ["出现", "common", 0], ["发生", "common", 0]] },
    { pos: "vt.", meanings: [["做", "normal", 0], ["装扮…的样子", "rare", 0], ["将满（…岁）", "normal", 0]] },
    { pos: "int.", meanings: [["嗨！", "rare", 0]] }
  ],
  "go": [
    { pos: "vi.", meanings: [["走", "common", 0], ["离开", "common", 0], ["去做", "common", 0], ["进行", "common", 0]] },
    { pos: "vt.", meanings: [["变得", "common", 0], ["发出…声音", "normal", 0], ["成为", "normal", 0], ["处于…状态", "normal", 0]] },
    { pos: "n.", meanings: [["轮到的顺序", "normal", 0], ["精力", "rare", 0], ["干劲", "rare", 0], ["尝试", "normal", 0]] }
  ],
  "look": [
    { pos: "vt. & vi.", meanings: [["看", "common", 0], ["瞧", "common", 0]] },
    { pos: "vi.", meanings: [["注意", "common", 0], ["面向", "common", 0], ["寻找", "common", 0], ["看起来好像", "common", 0]] },
    { pos: "n.", meanings: [["看", "common", 0], ["（尤指吸引人的）相貌", "common", 0], ["眼神", "normal", 0], ["样子", "normal", 0]] },
    { pos: "int.", meanings: [["（插话或唤起注意）喂", "rare", 0], ["听我说", "rare", 0]] }
  ],
  "see": [
    { pos: "vt. & vi.", meanings: [["看见", "common", 0], ["领会", "common", 0], ["理解", "common", 0], ["查看", "common", 0], ["参观", "common", 0]] },
    { pos: "n.", meanings: [["主教教区", "rare", 0], ["主教权限", "rare", 0], ["牧座", "rare", 0]] }
  ],
  "find": [
    { pos: "v.", meanings: [["发现", "common", 0], ["找到", "common", 0], ["查明", "common", 0], ["发觉", "common", 0]] },
    { pos: "n.", meanings: [["发现物", "normal", 0], ["被发现的人", "normal", 0]] }
  ],
  "leave": [
    { pos: "vt.", meanings: [["离开", "common", 0], ["遗弃", "common", 0], ["忘了带", "common", 0], ["交托", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["离去", "common", 0], ["出发", "common", 0], ["舍弃", "common", 0]] },
    { pos: "n.", meanings: [["准假", "normal", 0], ["假期", "common", 0], ["辞别", "rare", 0], ["许可", "rare", 0]] }
  ],
  "let": [
    { pos: "-", meanings: [["允许", "common", 0], ["任由", "common", 0], ["让", "common", 0], ["随", "normal", 0], ["假设", "normal", 0], ["出租", "normal", 0]] }
  ],
  "live": [
    { pos: "v.", meanings: [["生存", "common", 0], ["居住", "common", 0], ["活着", "common", 0], ["留存", "normal", 0]] }
  ],
  "meet": [
    { pos: "vt. & vi.", meanings: [["相遇", "common", 0], ["相识", "common", 0], ["开会", "common", 0], ["接触（某物）", "common", 0]] },
    { pos: "vt.", meanings: [["满足", "common", 0], ["支付", "normal", 0], ["迎接", "common", 0], ["经历（常指不愉快的事）", "common", 0]] },
    { pos: "n.", meanings: [["运动会", "normal", 0], ["体育比赛", "normal", 0], ["猎狐运动（尤其英式英语）", "rare", 0]] },
    { pos: "adj.", meanings: [["适当的", "rare", 0], ["合适的", "rare", 0], ["恰当的", "rare", 0]] }
  ],
  "move": [
    { pos: "vt. & vi.", meanings: [["移动", "common", 0], ["搬动", "common", 0]] },
    { pos: "vi.", meanings: [["搬家", "common", 0], ["行动", "common", 0], ["进展", "normal", 0], ["（机器等）开动", "normal", 0]] },
    { pos: "vt.", meanings: [["提议", "normal", 0], ["使感动", "common", 0], ["摇动", "normal", 0], ["变化", "normal", 0]] },
    { pos: "n.", meanings: [["改变", "common", 0], ["迁移", "normal", 0]] }
  ],
  "pass": [
    { pos: "vt. & vi.", meanings: [["走过", "common", 0], ["通过", "common", 0], ["批准", "normal", 0], ["度过", "common", 0]] },
    { pos: "vt.", meanings: [["传球", "normal", 0], ["及格", "normal", 0], ["发生", "normal", 0], ["不要", "normal", 0]] },
    { pos: "n.", meanings: [["通道", "normal", 0], ["通行证", "normal", 0], ["关口", "normal", 0], ["越过", "normal", 0]] }
  ],
  "play": [
    { pos: "n.", meanings: [["比赛", "normal", 0], ["游戏", "common", 0], ["戏剧", "common", 0], ["赌博", "rare", 0]] },
    { pos: "vt. & vi.", meanings: [["玩", "common", 0], ["演奏", "common", 0], ["演出", "common", 0], ["参加比赛", "common", 0]] },
    { pos: "vt.", meanings: [["扮演", "common", 0], ["担任", "common", 0], ["充当…的角色", "normal", 0], ["演出", "normal", 0], ["装扮", "normal", 0]] },
    { pos: "vi.", meanings: [["玩耍", "common", 0], ["游戏", "common", 0], ["[游戏] 参加游戏", "normal", 0], ["赌博", "rare", 0], ["闹着玩", "normal", 0]] }
  ],
  "point": [
    { pos: "n.", meanings: [["点", "common", 0], ["要点", "common", 0], ["得分", "common", 0], ["标点", "normal", 0]] },
    { pos: "vt.", meanings: [["（意思上）指向", "common", 0], ["削尖", "normal", 0], ["加标点于", "rare", 0], ["指路", "normal", 0]] },
    { pos: "vi.", meanings: [["表明", "common", 0], ["指向", "common", 0]] }
  ],
  "reach": [
    { pos: "v.", meanings: [["到达", "common", 0], ["走到", "common", 0], ["够…", "common", 0], ["抓…", "common", 0], ["完成", "normal", 0]] },
    { pos: "n.", meanings: [["手脚能够到的范围", "normal", 0], ["范围", "normal", 0], ["区域", "normal", 0], ["影响的范围", "normal", 0], ["管辖的范围", "normal", 0]] }
  ],
  "read": [
    { pos: "vt. & vi.", meanings: [["阅读", "common", 0], ["朗读", "common", 0], ["显示", "common", 0], ["研究", "normal", 0], ["看得懂", "common", 0]] },
    { pos: "vt.", meanings: [["显示", "normal", 0], ["阅读", "common", 0], ["读懂", "common", 0], ["理解", "common", 0]] },
    { pos: "n.", meanings: [["阅读", "normal", 0], ["读物", "normal", 0], ["读书", "normal", 0], ["里德（人名）", "rare", 0]] },
    { pos: "adj.", meanings: [["被朗读的", "rare", 0], ["博识的", "rare", 0], ["博览的", "rare", 0], ["有学问的", "rare", 0]] }
  ],
  "stand": [
    { pos: "n.", meanings: [["台", "common", 0], ["看台", "common", 0], ["立场", "common", 0], ["停止", "rare", 0], ["抵抗", "rare", 0]] },
    { pos: "vi.", meanings: [["站立", "common", 0], ["起立", "common", 0], ["竖直放置", "common", 0], ["保持看法", "normal", 0], ["停滞", "normal", 0]] },
    { pos: "vt.", meanings: [["使站立", "common", 0], ["忍受", "common", 0], ["抵御", "normal", 0], ["承担责任", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["站立", "common", 0], ["（使）直立", "common", 0], ["站着", "common", 0]] }
  ],
  "turn": [
    { pos: "v.", meanings: [["使转动", "common", 0], ["旋转", "common", 0], ["转身", "common", 0], ["翻转", "common", 0]] },
    { pos: "n.", meanings: [["转动", "common", 0], ["转向", "common", 0], ["转弯处", "common", 0], ["转变", "common", 0]] }
  ],
  "use": [
    { pos: "n.", meanings: [["使用", "common", 0], ["使用权", "normal", 0], ["功能", "normal", 0]] }
  ],
  "watch": [
    { pos: "vt.", meanings: [["注视", "common", 0], ["注意", "common", 0], ["看守", "common", 0], ["监视", "common", 0], ["守候（机会等）", "normal", 0], ["密切注意", "normal", 0]] },
    { pos: "n.", meanings: [["表", "common", 0], ["值夜", "rare", 0], ["值班", "rare", 0], ["看守", "normal", 0], ["监视", "normal", 0], ["值班人员", "rare", 0]] },
    { pos: "vi.", meanings: [["观看", "common", 0], ["注视", "common", 0], ["守候", "normal", 0], ["看守", "normal", 0]] }
  ],
  "ask": [
    { pos: "vt. & vi.", meanings: [["问", "common", 0], ["询问", "common", 0], ["需要", "common", 0], ["要求", "common", 0], ["请求", "common", 0], ["邀请", "common", 0]] },
    { pos: "vt.", meanings: [["邀请", "common", 0], ["请求允许", "normal", 0], ["要价", "normal", 0], ["询问", "common", 0]] },
    { pos: "vi.", meanings: [["请", "normal", 0], ["邀请", "normal", 0], ["询问", "normal", 0], ["要求", "normal", 0]] }
  ],
  "bear": [
    { pos: "n.", meanings: [["熊", "common", 0], ["（在证券市场等）卖空的人", "rare", 0], ["蛮横的人", "rare", 0]] },
    { pos: "vt.", meanings: [["忍受", "common", 0], ["承担", "common", 0], ["支撑", "common", 0], ["生育", "common", 0]] },
    { pos: "vi.", meanings: [["生（孩子）", "normal", 0], ["结（果实）", "normal", 0], ["与…有关", "rare", 0]] },
    { pos: "adj.", meanings: [["跌价的", "rare", 0], ["股票行情下跌的", "rare", 0], ["卖空者的", "rare", 0]] }
  ],
  "break": [
    { pos: "vt.", meanings: [["（使）破", "common", 0], ["打破（纪录）", "common", 0], ["（常指好天气）突变", "normal", 0], ["开始", "normal", 0]] },
    { pos: "vi.", meanings: [["（嗓音）突变", "normal", 0], ["突破", "common", 0], ["破晓", "normal", 0], ["（价格）突然下跌", "normal", 0]] },
    { pos: "n.", meanings: [["破裂", "common", 0], ["中间休息", "common", 0], ["间断", "normal", 0], ["短假", "normal", 0]] }
  ],
  "carry": [
    { pos: "vt.", meanings: [["支撑", "common", 0], ["携带", "common", 0], ["输送", "common", 0], ["运载", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["运送", "common", 0], ["搬运", "common", 0], ["具有", "common", 0]] },
    { pos: "vi.", meanings: [["（文学、戏剧等）对读者", "rare", 0], ["扔（或踢）到…距离", "rare", 0], ["（马等）具有某种姿势", "rare", 0], ["传得很远", "normal", 0]] },
    { pos: "n.", meanings: [["（枪炮、火箭等的）射程", "normal", 0], ["运输", "normal", 0], ["运送", "normal", 0]] }
  ],
  "catch": [
    { pos: "vt.", meanings: [["赶上", "common", 0], ["接住", "common", 0], ["引起", "common", 0], ["看见", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["（使）被钩住", "normal", 0], ["（使）被卡住", "normal", 0]] },
    { pos: "n.", meanings: [["抓", "normal", 0], ["隐情", "normal", 1], ["捕获量", "normal", 0], ["挂钩", "normal", 0]] },
    { pos: "vi.", meanings: [["锁住", "normal", 0], ["着火", "common", 0], ["[棒球]当接球手", "rare", 0]] },
    { pos: "adj.", meanings: [["迷惑人的", "rare", 0], ["令人容易上当的", "rare", 0], ["引人注目的", "normal", 0], ["令人感兴趣的", "normal", 0]] }
  ],
  "run": [
    { pos: "vt. & vi.", meanings: [["跑", "common", 0], ["移动", "common", 0], ["（使）流动", "normal", 0]] },
    { pos: "n.", meanings: [["奔跑", "common", 0], ["行程", "normal", 0], ["放映期", "rare", 0], ["一系列", "normal", 0]] },
    { pos: "vi.", meanings: [["（工作等）进行", "common", 0], ["延续", "normal", 0], ["逃跑", "common", 0], ["行驶", "normal", 0]] },
    { pos: "vt.", meanings: [["使奔跑", "common", 0], ["使…快速移动", "normal", 0], ["运行", "normal", 0], ["经营", "normal", 0], ["划", "rare", 0]] },
    { pos: "adj.", meanings: [["融化的", "rare", 0], ["浇铸的", "rare", 0], ["跑的筋疲力尽的", "rare", 0]] }
  ],
  "manufacture": [
    { pos: "vt.", meanings: [["制造", "common", 0], ["生产", "common", 0], ["捏造", "normal", 1], ["虚构", "normal", 1], ["加工", "normal", 0], ["从事制造", "normal", 0]] },
    { pos: "n.", meanings: [["制造", "normal", 0], ["制成品", "normal", 0], ["产品", "normal", 0], ["工业", "normal", 0], ["工厂", "rare", 0], ["（文学作品等的）粗制滥造", "rare", 0]] }
  ],
  "address": [
    { pos: "n.", meanings: [["地址", "common", 0], ["通信处", "common", 0], ["演说", "common", 0], ["称呼", "normal", 0]] },
    { pos: "v.", meanings: [["写姓名地址", "normal", 0], ["演说", "normal", 0], ["向…说话", "normal", 1], ["称呼", "normal", 1]] }
  ],
  "subject": [
    { pos: "n.", meanings: [["主题", "common", 0], ["话题", "common", 0], ["学科", "common", 0], ["科目", "common", 0], ["[哲]主观", "rare", 0]] },
    { pos: "adj.", meanings: [["须服从…的", "normal", 0], ["（在君主等）统治下的", "normal", 0]] },
    { pos: "v.", meanings: [["提供", "normal", 0], ["提出", "normal", 0], ["使…隶属", "normal", 0]] }
  ],
  "well": [
    { pos: "adv.", meanings: [["好", "common", 0], ["很", "common", 0], ["好意地", "common", 0], ["高高兴兴地", "normal", 0]] },
    { pos: "adj.", meanings: [["健康的", "common", 0], ["井的", "normal", 0], ["良好的", "normal", 0], ["恰当的", "normal", 0]] },
    { pos: "int.", meanings: [["（用于表示惊讶", "normal", 0], ["疑虑", "normal", 0], ["接受等）", "normal", 0]] },
    { pos: "n.", meanings: [["泉", "normal", 0], ["源泉", "normal", 0], ["水井", "normal", 1]] },
    { pos: "vi.", meanings: [["（液体）涌出", "normal", 0], ["流出", "normal", 0], ["涌流", "rare", 0], ["涌上", "rare", 0]] },
    { pos: "vt.", meanings: [["涌出", "normal", 0], ["喷出", "normal", 0]] }
  ],
  "charge": [
    { pos: "vt.", meanings: [["装载", "normal", 0], ["控诉", "common", 0], ["使充电", "common", 0], ["索（价）", "normal", 0]] },
    { pos: "vi.", meanings: [["索价", "normal", 0], ["向前冲", "normal", 0], ["记在账上", "normal", 0], ["充电", "normal", 0]] },
    { pos: "n.", meanings: [["费用", "common", 0], ["指示", "rare", 0], ["掌管", "common", 0], ["指责", "normal", 0]] }
  ],
  "cover": [
    { pos: "v.", meanings: [["遮盖", "common", 0], ["掩蔽", "common", 0], ["涉及", "common", 0], ["洒上", "normal", 0]] },
    { pos: "n.", meanings: [["覆盖物", "common", 0], ["避难所", "normal", 0], ["掩护", "normal", 0], ["封面", "common", 0]] }
  ],
  "say": [
    { pos: "vi.", meanings: [["说", "common", 0], ["讲", "common", 0], ["表明", "common", 0], ["宣称", "common", 0], ["假设", "normal", 0], ["约莫", "rare", 0]] },
    { pos: "vt.", meanings: [["表明", "common", 0], ["念", "normal", 0], ["说明", "common", 0], ["比方说", "normal", 0]] },
    { pos: "n.", meanings: [["发言权", "common", 0], ["说话", "normal", 0], ["要说的话", "normal", 0]] }
  ],
  "time": [
    { pos: "n.", meanings: [["时间", "common", 0], ["时刻", "common", 0], ["时代", "common", 0], ["次", "common", 0]] },
    { pos: "vt.", meanings: [["为…安排时间", "normal", 0], ["测定…的时间", "normal", 0], ["调准（机械的）速度", "rare", 0], ["拨准（钟、表）的快慢", "rare", 0]] },
    { pos: "vi.", meanings: [["合拍", "normal", 0], ["和谐", "rare", 0], ["打拍子", "rare", 0]] },
    { pos: "adj.", meanings: [["定时的", "normal", 0], ["定期的", "normal", 0], ["[美国英语]分期（付款）的", "rare", 0]] },
    { pos: "int.", meanings: [["[体育]时间到", "rare", 0], ["（一场或一局等的）比赛时限", "rare", 0], ["暂停", "normal", 0]] }
  ],
  "man": [
    { pos: "n.", meanings: [["男人", "common", 0], ["人类", "common", 0], ["男子汉", "common", 0], ["雇工", "normal", 0]] },
    { pos: "vt.", meanings: [["使振作", "normal", 0], ["操纵", "normal", 0], ["给…配置人员", "normal", 0], ["在…就位", "normal", 0]] },
    { pos: "int.", meanings: [["（表示惊讶、气愤等）嘿", "rare", 0], ["天哪", "rare", 0]] }
  ],
  "hand": [
    { pos: "n.", meanings: [["手", "common", 0], ["协助", "common", 0], ["帮助", "common", 0], ["（工具等的）把", "rare", 0], ["柄", "rare", 0], ["掌管", "normal", 0]] },
    { pos: "vt.", meanings: [["传递", "common", 0], ["交给", "common", 0], ["搀扶", "normal", 0], ["支持", "normal", 0]] }
  ],
  "head": [
    { pos: "n.", meanings: [["上端", "normal", 0], ["头脑", "common", 0], ["头部", "common", 0], ["首脑", "common", 0], ["首长", "normal", 0]] },
    { pos: "vt.", meanings: [["用头顶", "normal", 0], ["前进", "normal", 0], ["作为…的首领", "normal", 0], ["站在…的前头", "normal", 0]] },
    { pos: "vi.", meanings: [["朝…行进", "common", 0], ["出发", "common", 0], ["向…方向移动", "common", 0], ["船驶往", "normal", 0]] },
    { pos: "adj.", meanings: [["头的", "normal", 0], ["在前头的", "normal", 0], ["首要的", "normal", 0], ["在顶端的", "normal", 0]] }
  ],
  "way": [
    { pos: "n.", meanings: [["道路", "common", 0], ["方法", "common", 0], ["方向", "common", 0], ["某方面", "common", 0]] },
    { pos: "adv.", meanings: [["远远地", "normal", 0], ["大大地", "normal", 0]] }
  ],
  "word": [
    { pos: "n.", meanings: [["单词", "common", 0], ["话语", "common", 0], ["诺言", "common", 0], ["消息", "normal", 0]] },
    { pos: "vt.", meanings: [["措辞", "normal", 0], ["用词", "normal", 0], ["用言语表达", "normal", 0]] },
    { pos: "vi.", meanings: [["讲话", "rare", 0]] }
  ],
  "eye": [
    { pos: "n.", meanings: [["眼睛", "common", 0], ["视力", "common", 0], ["眼状物", "normal", 0], ["风纪扣扣眼", "rare", 0]] },
    { pos: "vt.", meanings: [["定睛地看", "normal", 0], ["注视", "normal", 0], ["审视", "normal", 0], ["细看", "normal", 0]] }
  ],
  "face": [
    { pos: "n.", meanings: [["面容", "common", 0], ["表面", "common", 0], ["脸", "common", 0], ["方面", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["面对", "common", 0], ["面向…", "common", 0], ["正视", "common", 0], ["承认", "normal", 0]] },
    { pos: "vt.", meanings: [["（感到不能）对付", "normal", 0], ["（明知不好办而）交谈", "rare", 0], ["必须对付（某情况）", "normal", 0], ["面临…", "normal", 0]] }
  ],
  "ground": [
    { pos: "n.", meanings: [["地面", "common", 0], ["土地", "common", 0], ["基础", "common", 0], ["范围", "normal", 0], ["阵地", "normal", 0], ["战场", "normal", 0]] },
    { pos: "vi.", meanings: [["搁浅", "normal", 0], ["停飞", "normal", 0], ["着陆", "normal", 0]] },
    { pos: "vt.", meanings: [["把…放在地上", "normal", 0], ["在…的基础树立上", "rare", 0], ["交给…基本知识", "rare", 0], ["使…受初步训练", "rare", 0]] },
    { pos: "v.", meanings: [["grind的过去式和过去分词", "rare", 0]] }
  ],
  "matter": [
    { pos: "n.", meanings: [["事件", "normal", 0], ["（讨论、考虑等的）问题", "common", 0], ["重要性", "normal", 0], ["物质", "common", 0]] },
    { pos: "vi.", meanings: [["要紧", "common", 0], ["重要", "common", 0], ["化脓", "rare", 0], ["有重大影响", "normal", 0], ["有重要性", "normal", 0]] }
  ],
  "sense": [
    { pos: "n.", meanings: [["感觉", "common", 0], ["官能", "common", 0], ["意识", "common", 0], ["观念", "common", 0], ["理性", "common", 0], ["识别力", "normal", 0]] },
    { pos: "vt.", meanings: [["感到", "common", 0], ["理解", "normal", 0], ["领会", "normal", 0], ["检测出", "normal", 0]] }
  ],
  "term": [
    { pos: "n.", meanings: [["学期", "common", 0], ["条款", "common", 0], ["术语", "common", 0], ["期限", "common", 0]] },
    { pos: "vt.", meanings: [["把…称为", "normal", 0], ["把…叫做", "normal", 0]] }
  ],
  "mind": [
    { pos: "n.", meanings: [["心", "common", 0], ["精神", "common", 0], ["心力", "normal", 0], ["知", "normal", 0], ["智力", "normal", 0], ["智慧", "normal", 0], ["心胸", "normal", 0], ["头脑", "common", 0], ["人", "normal", 0], ["愿望", "normal", 0], ["目的", "normal", 0], ["意向", "normal", 0], ["意志", "normal", 0], ["决心", "normal", 0], ["见解", "normal", 0], ["意见", "normal", 0], ["记忆", "normal", 0], ["记性", "normal", 0], ["记忆力", "normal", 0], ["回想", "normal", 0]] },
    { pos: "vi.", meanings: [["介意", "common", 0], ["注意", "normal", 0]] },
    { pos: "vt.", meanings: [["专心于", "normal", 0], ["介意", "common", 0], ["愿意做", "normal", 0], ["照顾", "normal", 0]] }
  ],
  "course": [
    { pos: "n.", meanings: [["课程", "common", 0], ["航线", "normal", 0], ["行动方向", "normal", 0], ["一道菜", "normal", 0]] },
    { pos: "vt.", meanings: [["快速地流动", "rare", 0], ["奔流", "rare", 0], ["跑过", "rare", 0], ["追逐", "rare", 0]] },
    { pos: "vi.", meanings: [["沿…（方向）前进", "rare", 0], ["指引航线", "rare", 0], ["快跑", "rare", 0], ["迅速移动", "rare", 0]] }
  ],
  "reason": [
    { pos: "n.", meanings: [["理由", "common", 0], ["原因", "common", 0], ["理性", "common", 0], ["理智", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["推理", "normal", 0], ["思考", "normal", 0], ["争辩", "normal", 0], ["辩论", "normal", 0], ["向…解释", "normal", 0]] }
  ],
  "respect": [
    { pos: "vt.", meanings: [["尊重", "common", 0], ["尊敬", "common", 0], ["关心", "normal", 0], ["遵守", "normal", 0]] },
    { pos: "n.", meanings: [["尊重", "common", 0], ["恭敬", "normal", 0], ["敬意", "normal", 0], ["某方面", "normal", 0]] }
  ],
  "result": [
    { pos: "n.", meanings: [["结果", "common", 0], ["（尤指足球比赛的）胜利", "normal", 0], ["[体]比分", "rare", 0], ["成功实现的事", "normal", 0]] },
    { pos: "vi.", meanings: [["发生", "normal", 0], ["产生", "normal", 0], ["归结为", "normal", 0], ["导致", "normal", 0], ["后果", "normal", 0], ["终结", "normal", 0], ["由…而造成[产生]", "normal", 0]] }
  ],
  "return": [
    { pos: "v.", meanings: [["回转", "common", 0], ["返回", "common", 0], ["复发", "normal", 0], ["又来", "normal", 0], ["送还", "common", 0], ["言归正传", "rare", 0]] },
    { pos: "n.", meanings: [["归来", "common", 0], ["返乡", "common", 0], ["来回", "normal", 0], ["汇成", "rare", 0], ["赢利", "normal", 0], ["统计表", "rare", 0]] }
  ],
  "rise": [
    { pos: "vi.", meanings: [["上升", "common", 0], ["增强", "common", 0], ["（数量）增加", "common", 0], ["休会", "rare", 0]] },
    { pos: "n.", meanings: [["（数量或水平的）增加", "common", 0], ["兴起", "common", 0], ["（数量、价格、价值等的）增长", "common", 0], ["（日、月等的）升起", "normal", 0]] },
    { pos: "vt.", meanings: [["使…浮上水面", "rare", 0], ["使（鸟）飞起", "rare", 0], ["复活", "rare", 0], ["发酵", "rare", 0]] }
  ],
  "save": [
    { pos: "vt.", meanings: [["节省", "common", 0], ["保存", "common", 0], ["储蓄", "common", 0], ["解救", "common", 0]] },
    { pos: "vi.", meanings: [["节省", "common", 0], ["挽救", "common", 0], ["救球", "rare", 0]] },
    { pos: "prep. & conj.", meanings: [["除…之外", "normal", 1]] },
    { pos: "n.", meanings: [["救援", "normal", 0]] }
  ],
  "sell": [
    { pos: "vt. & vi.", meanings: [["卖", "common", 0], ["售", "common", 0], ["使好卖", "normal", 0], ["使接受", "normal", 0], ["使赞成", "normal", 0], ["销售", "normal", 0]] },
    { pos: "vt.", meanings: [["经销", "normal", 0], ["推销", "normal", 0], ["出卖", "normal", 0], ["欺骗", "rare", 0]] },
    { pos: "n.", meanings: [["销售", "normal", 0], ["欺骗", "rare", 0], ["失望", "rare", 0], ["推销术", "rare", 0]] },
    { pos: "vi.", meanings: [["卖", "common", 0], ["出售", "common", 0], ["受欢迎", "normal", 0], ["有销路", "normal", 0]] }
  ],
  "send": [
    { pos: "vt.", meanings: [["送", "common", 0], ["使作出（某种反应）", "normal", 0], ["派遣", "common", 0], ["使进入（某状态）", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["用无线电波发送", "rare", 0], ["发出信息", "normal", 0]] },
    { pos: "vi.", meanings: [["派遣", "common", 0], ["发出", "normal", 0], ["派人", "normal", 0]] },
    { pos: "adj.", meanings: [["[仅用作定语]用于发送的", "rare", 0]] }
  ],
  "start": [
    { pos: "n.", meanings: [["开始", "common", 0], ["动身", "normal", 0], ["开动", "normal", 0], ["起点", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["出发", "common", 0], ["启程", "common", 0]] },
    { pos: "vt.", meanings: [["起动", "common", 0], ["提出（问题）", "normal", 0], ["开办", "normal", 0], ["使开始", "normal", 0]] },
    { pos: "vi.", meanings: [["起始", "normal", 0], ["突然出现", "normal", 0], ["突然跳起", "normal", 0], ["突然涌出", "normal", 0]] }
  ],
  "stop": [
    { pos: "vi.", meanings: [["停止", "common", 0], ["中断", "normal", 0], ["逗留", "normal", 0], ["（使）停止工作", "normal", 0]] },
    { pos: "vt.", meanings: [["塞住", "normal", 0], ["堵塞", "normal", 0], ["阻挠", "normal", 0], ["止付", "rare", 0]] },
    { pos: "n.", meanings: [["停止", "common", 0], ["（管风琴的）音栓", "rare", 0], ["停车站", "normal", 0], ["（管风琴的）音管", "rare", 0]] }
  ],
  "stay": [
    { pos: "vt. & vi.", meanings: [["停留", "common", 0], ["停止", "common", 0], ["坚持", "common", 0], ["抑制", "normal", 0]] },
    { pos: "vi.", meanings: [["继续处于某种状态", "normal", 0]] },
    { pos: "n.", meanings: [["逗留", "common", 0], ["延期", "rare", 0], ["倚靠", "rare", 0], ["忍耐", "rare", 0]] }
  ],
  "study": [
    { pos: "n.", meanings: [["学习", "common", 0], ["研究", "common", 0], ["课题", "normal", 0], ["书房", "normal", 0], ["结论", "normal", 0]] },
    { pos: "vi.", meanings: [["考虑", "normal", 0], ["沉思", "normal", 0], ["默想", "rare", 0], ["努力", "rare", 0]] },
    { pos: "vt.", meanings: [["想出", "normal", 0], ["详细地检查", "normal", 0], ["背诵（台词等）", "normal", 0], ["为…费心思", "rare", 0]] }
  ],
  "suggest": [
    { pos: "vt.", meanings: [["建议", "common", 0], ["提议", "common", 0], ["暗示", "common", 0], ["使想起", "normal", 0], ["启示", "normal", 0]] }
  ],
  "suit": [
    { pos: "n.", meanings: [["一套外衣", "normal", 0], ["西装", "common", 0], ["套装", "normal", 0], ["诉讼", "normal", 1], ["恳求", "rare", 0]] },
    { pos: "vt.", meanings: [["适合于（某人）", "common", 0], ["尤指服装、颜色等相配", "normal", 0], ["合身", "common", 0], ["适宜", "normal", 0]] },
    { pos: "vi.", meanings: [["合适", "common", 0], ["相称", "normal", 0]] }
  ],
  "supply": [
    { pos: "vt.", meanings: [["供给", "common", 0], ["补充", "normal", 0], ["弥补（缺陷、损失等）", "normal", 0], ["向…提供（物资等）", "common", 0]] },
    { pos: "n.", meanings: [["供给物", "normal", 0], ["储备物质", "normal", 0], ["粮食", "normal", 0]] },
    { pos: "vi.", meanings: [["暂代他人职务", "rare", 0]] }
  ],
  "support": [
    { pos: "vt.", meanings: [["支持", "common", 0], ["帮助", "common", 0], ["支撑", "common", 0], ["维持", "common", 0]] },
    { pos: "n.", meanings: [["支撑", "common", 0], ["支持者", "normal", 0], ["[数学]支集", "rare", 0], ["支撑物", "normal", 0]] }
  ],
  "suppose": [
    { pos: "vt.", meanings: [["假定", "common", 0], ["猜想", "common", 0], ["推测", "normal", 0], ["认为", "common", 0], ["让（用于祈祷语气）", "rare", 0]] },
    { pos: "vi.", meanings: [["想象", "normal", 0], ["猜想", "normal", 0]] }
  ],
  "talk": [
    { pos: "v.", meanings: [["说话", "common", 0], ["讨论", "common", 0], ["讲", "common", 0], ["说", "common", 0], ["说闲话", "normal", 0]] },
    { pos: "n.", meanings: [["交谈", "common", 0], ["讨论", "common", 0], ["报告", "normal", 0], ["空话", "normal", 0]] }
  ],
  "teach": [
    { pos: "vt.", meanings: [["教", "common", 0], ["教导", "common", 0], ["训练", "common", 0], ["教授", "common", 0]] },
    { pos: "vi.", meanings: [["教书", "common", 0]] }
  ],
  "tell": [
    { pos: "vt.", meanings: [["告诉", "common", 0], ["说", "common", 0], ["辨别", "common", 0], ["吩咐", "common", 0], ["讲述", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["分辨", "normal", 0], ["辨别", "common", 0], ["告诉", "common", 0], ["吩咐", "normal", 0], ["泄漏", "normal", 0], ["保证", "normal", 0]] },
    { pos: "vi.", meanings: [["泄密", "normal", 0], ["告发", "normal", 0], ["（颜色、声音等）显示", "normal", 0], ["识别", "normal", 0]] },
    { pos: "n.", meanings: [["[考古学]（古代村落遗址堆积而成的）台形土墩", "rare", 0], ["[方言]讲的话", "rare", 0], ["谈话", "normal", 0], ["传闻", "normal", 0]] }
  ],
  "tend": [
    { pos: "vt.", meanings: [["照料", "normal", 0], ["照顾", "normal", 0], ["护理", "normal", 0], ["照管", "normal", 0], ["管理", "normal", 0]] },
    { pos: "vi.", meanings: [["倾向（于）", "common", 0], ["趋向（于）", "common", 0], ["伺侯", "normal", 0], ["招待", "normal", 0], ["关心", "normal", 0], ["注意", "normal", 0]] }
  ],
  "throw": [
    { pos: "vi.", meanings: [["投掷", "common", 0], ["丢", "common", 0], ["抛", "common", 0]] },
    { pos: "n.", meanings: [["投掷的距离", "normal", 0], ["丢", "normal", 0]] },
    { pos: "vt.", meanings: [["掷（色子）", "normal", 0], ["抛", "common", 0], ["猛动（头、臂、腿）", "normal", 0], ["使处于", "normal", 0], ["使限于", "normal", 0]] }
  ],
  "touch": [
    { pos: "vt.", meanings: [["触摸", "common", 0], ["使某物与…轻轻接触", "common", 0], ["吃或喝", "normal", 0], ["尝", "normal", 0], ["[数]与…相切", "rare", 0]] },
    { pos: "n.", meanings: [["触摸", "common", 0], ["碰", "common", 0], ["触觉", "common", 0], ["触感", "normal", 0], ["修饰", "normal", 0], ["润色", "normal", 0], ["痕迹", "normal", 0]] },
    { pos: "vi.", meanings: [["接触", "common", 0], ["联系", "normal", 0]] }
  ],
  "trade": [
    { pos: "n.", meanings: [["贸易", "common", 0], ["行业", "common", 0], ["<美>顾客", "rare", 0], ["买卖", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["交易", "common", 0], ["经商", "normal", 0]] },
    { pos: "vt.", meanings: [["交换", "normal", 0], ["经营…交易", "normal", 0], ["做…的买卖", "normal", 0]] },
    { pos: "vi.", meanings: [["贸易", "normal", 0], ["买卖", "normal", 0], ["以物易物", "normal", 0]] }
  ],
  "train": [
    { pos: "n.", meanings: [["火车", "common", 0], ["行列", "normal", 0], ["一系列相关的事情", "normal", 0], ["拖裾", "rare", 0]] },
    { pos: "v.", meanings: [["训练", "common", 0], ["教育", "normal", 0], ["培养", "common", 0], ["修整", "normal", 0]] }
  ],
  "treat": [
    { pos: "n.", meanings: [["款待", "normal", 0], ["招待", "normal", 0], ["乐事", "normal", 0], ["乐趣", "normal", 0]] },
    { pos: "v.", meanings: [["对待", "common", 0], ["治疗", "common", 0], ["处理", "common", 0], ["款待", "common", 0]] }
  ],
  "trust": [
    { pos: "n.", meanings: [["信任", "common", 0], ["信托", "normal", 0], ["照管", "normal", 0], ["受托基金机构", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["相信", "common", 0], ["信任", "common", 0]] },
    { pos: "vt.", meanings: [["对…有信心", "normal", 0], ["依赖于", "normal", 0], ["盼望", "normal", 0], ["自信地期待", "normal", 0], ["设想", "normal", 0], ["相信", "normal", 0], ["让他人照管", "normal", 0], ["托管", "normal", 0]] }
  ],
  "value": [
    { pos: "n.", meanings: [["价值", "common", 0], ["价格", "common", 0], ["意义", "common", 0], ["涵义", "normal", 0], ["重要性", "common", 0], ["（邮票的）面值", "normal", 0]] },
    { pos: "vt.", meanings: [["评价", "normal", 0], ["重视", "common", 0], ["看重", "common", 0], ["估价", "normal", 0], ["给…定价", "normal", 0]] }
  ],
  "visit": [
    { pos: "vt. & vi.", meanings: [["访问", "common", 0], ["探望", "common", 0], ["参观", "common", 0], ["游览", "common", 0]] },
    { pos: "vi.", meanings: [["作客", "normal", 0]] },
    { pos: "n.", meanings: [["访问", "common", 0], ["参观", "common", 0], ["逗留", "normal", 0]] },
    { pos: "vt.", meanings: [["拜访", "common", 0], ["参观", "normal", 0]] }
  ],
  "wait": [
    { pos: "vt. & vi.", meanings: [["等候", "common", 0], ["等待", "common", 0], ["（尤指长期地）希望", "normal", 0], ["盼望", "normal", 0]] },
    { pos: "vi.", meanings: [["准备妥", "normal", 0], ["在手边", "normal", 0], ["可得到", "normal", 0], ["可使用", "normal", 0]] },
    { pos: "vt.", meanings: [["推迟", "normal", 0], ["搁置", "normal", 0], ["延缓", "normal", 0]] }
  ],
  "walk": [
    { pos: "vt. & vi.", meanings: [["走", "common", 0], ["步行", "common", 0], ["散步", "common", 0]] },
    { pos: "n.", meanings: [["步行", "common", 0], ["步态", "normal", 0], ["人行道", "normal", 0], ["步行的路径", "normal", 0]] },
    { pos: "vi.", meanings: [["行走", "common", 0], ["陪伴…走", "normal", 0], ["徒步旅行", "normal", 0], ["不翼而飞", "normal", 0]] },
    { pos: "vt.", meanings: [["牵着（动物）走", "normal", 0], ["遛", "normal", 0], ["赶着…走", "normal", 0]] }
  ],
  "wear": [
    { pos: "vt.", meanings: [["穿着", "common", 0], ["戴着", "common", 0], ["面露", "normal", 0], ["留着（胡须等）", "normal", 0], ["磨损", "normal", 0]] },
    { pos: "vi.", meanings: [["耐用", "normal", 0], ["保持不变", "normal", 0], ["磨损", "normal", 0], ["耗损", "normal", 0], ["逐渐或枯燥地通过", "normal", 0]] },
    { pos: "n.", meanings: [["穿着", "common", 0], ["穿戴物", "normal", 0], ["衣物", "normal", 0], ["磨损", "normal", 0], ["穿旧", "normal", 0], ["耐用性", "normal", 0]] }
  ],
  "win": [
    { pos: "vt. & vi.", meanings: [["（在…中）获胜", "common", 0], ["赢", "common", 0], ["战胜（对手）", "common", 0]] },
    { pos: "vt.", meanings: [["（通过努力等）赢得", "common", 0], ["说服", "normal", 0], ["达到（目的、要求等）", "normal", 0], ["获得…", "normal", 0]] },
    { pos: "n.", meanings: [["（体育比赛中）胜利", "common", 0], ["赢", "common", 0], ["[常用复数]赢得物", "normal", 0], ["收益", "normal", 0]] },
    { pos: "vi.", meanings: [["顺利到达", "normal", 0], ["成功", "common", 0]] }
  ],
  "wonder": [
    { pos: "adj.", meanings: [["奇妙的", "normal", 0], ["钦佩的", "rare", 0], ["远超过预期的", "rare", 0]] },
    { pos: "n.", meanings: [["惊奇", "common", 0], ["奇观", "common", 0], ["奇人", "normal", 0], ["奇迹", "common", 0]] },
    { pos: "vt.", meanings: [["对…感到好奇", "common", 0], ["惊奇", "common", 0], ["感到诧异", "normal", 0], ["想弄明白", "common", 0]] },
    { pos: "vi.", meanings: [["怀疑", "normal", 0], ["想知道", "common", 0], ["惊讶", "normal", 0]] }
  ],
  "worry": [
    { pos: "n.", meanings: [["烦恼", "common", 0], ["忧虑", "common", 0], ["担心", "common", 0], ["撕咬", "rare", 0]] },
    { pos: "vi.", meanings: [["担心", "common", 0], ["焦虑", "common", 0], ["为…发愁", "common", 0], ["撕咬", "rare", 0]] },
    { pos: "vt.", meanings: [["使烦恼", "common", 0], ["烦扰", "normal", 0], ["撕咬", "rare", 0]] }
  ],
  "raise": [
    { pos: "v.", meanings: [["提升", "common", 0], ["增加", "common", 0], ["养育", "common", 0], ["筹集", "common", 0]] },
    { pos: "n.", meanings: [["提升", "normal", 0], ["增加", "normal", 0], ["高处", "rare", 0], ["举起", "rare", 0]] }
  ],
  "settle": [
    { pos: "vt.", meanings: [["解决", "common", 0], ["安排", "normal", 0], ["使定居", "common", 0], ["使沉淀", "normal", 0]] },
    { pos: "vi.", meanings: [["下沉", "normal", 0], ["定居", "common", 0]] },
    { pos: "n.", meanings: [["高背长靠椅", "rare", 0]] }
  ],
  "share": [
    { pos: "n.", meanings: [["股", "common", 0], ["（参与、得到等的）份", "common", 0], ["（分享到的或贡献出的）一份", "common", 0], ["市场占有率", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["共有", "common", 0], ["共用", "common", 0], ["均摊", "normal", 0]] },
    { pos: "vt.", meanings: [["分配", "normal", 0], ["分开", "normal", 0], ["共同承担", "normal", 0]] },
    { pos: "vi.", meanings: [["分享", "common", 0], ["分担(in)", "normal", 0]] }
  ],
  "appear": [
    { pos: "vi.", meanings: [["出现", "common", 0], ["显现", "common", 0], ["出庭", "normal", 0], ["出场", "normal", 0], ["演出", "normal", 0], ["发表", "normal", 0]] }
  ],
  "apply": [
    { pos: "vt.", meanings: [["应用", "common", 0], ["运用", "common", 0], ["申请", "common", 0], ["涂", "normal", 0], ["敷（药）", "normal", 0]] },
    { pos: "vi.", meanings: [["申请", "common", 0], ["请求", "normal", 0], ["适用", "common", 0], ["适合", "common", 0], ["专心致志", "normal", 0]] }
  ],
  "attend": [
    { pos: "vi.", meanings: [["出席", "common", 0], ["致力于", "normal", 0], ["献身于", "normal", 0], ["侍候", "normal", 0], ["照顾", "normal", 0], ["关注", "normal", 0]] },
    { pos: "vt.", meanings: [["出席", "common", 0], ["参加", "common", 0], ["[常用被动语态]（作为结果、情况）伴随", "normal", 0], ["照顾", "normal", 0], ["陪伴", "normal", 0]] }
  ],
  "believe": [
    { pos: "v.", meanings: [["信任", "common", 0], ["料想", "normal", 0], ["笃信宗教", "rare", 0]] },
    { pos: "vt.", meanings: [["相信", "common", 0], ["以为", "common", 0], ["认为", "common", 0], ["对…信以为真", "normal", 0], ["信任", "common", 0]] }
  ],
  "build": [
    { pos: "vt.", meanings: [["建造", "common", 0], ["构筑", "common", 0], ["建立", "common", 0], ["开发", "normal", 0], ["为…建立基础", "normal", 0]] },
    { pos: "vi.", meanings: [["建造", "common", 0], ["营造", "normal", 0], ["扩大", "normal", 0], ["扩展", "normal", 0], ["发展", "normal", 0], ["达到", "normal", 0]] },
    { pos: "n.", meanings: [["体格", "common", 0], ["构造", "normal", 0], ["〈俚〉优美的体型", "rare", 0], ["肉体美", "rare", 0]] }
  ],
  "change": [
    { pos: "vt.", meanings: [["改变", "common", 0], ["变更", "common", 0], ["交换", "common", 0], ["替换", "common", 0], ["兑换", "normal", 0], ["换衣服（床单）", "normal", 0]] },
    { pos: "vi.", meanings: [["改变", "common", 0], ["转变", "common", 0], ["交换", "normal", 0], ["互换", "normal", 0], ["换衣", "normal", 0], ["更衣", "normal", 0]] },
    { pos: "n.", meanings: [["变化", "common", 0], ["改变", "common", 0], ["交换", "normal", 0], ["交替", "normal", 0], ["零钱", "common", 0], ["找头", "normal", 0], ["代替物", "normal", 0]] }
  ],
  "check": [
    { pos: "vt.", meanings: [["检查", "common", 0], ["核对", "common", 0], ["制止", "normal", 0], ["抑制", "normal", 0], ["在…上打勾", "normal", 0]] },
    { pos: "vi.", meanings: [["核实", "common", 0], ["查核", "common", 0], ["中止", "normal", 0], ["打勾", "normal", 0], ["[象棋]将一军", "rare", 0]] },
    { pos: "n.", meanings: [["<美>支票", "common", 0], ["制止", "normal", 0], ["抑制", "normal", 0], ["检验", "common", 0], ["核对", "common", 0]] }
  ],
  "choose": [
    { pos: "vt.", meanings: [["挑选", "common", 0], ["认为…比其它更可取", "normal", 0], ["决定或选定", "normal", 0]] },
    { pos: "vi.", meanings: [["选择", "common", 0], ["进行挑选", "common", 0]] }
  ],
  "close": [
    { pos: "adj.", meanings: [["紧密的", "common", 0], ["亲密的", "common", 0], ["亲近的", "common", 0]] },
    { pos: "vt.", meanings: [["关", "common", 0], ["结束", "common", 0], ["使靠近", "normal", 0]] },
    { pos: "vi.", meanings: [["关", "common", 0], ["结束", "common", 0], ["关闭", "common", 0]] },
    { pos: "adv.", meanings: [["紧密地", "normal", 0]] },
    { pos: "n.", meanings: [["结束", "common", 0]] }
  ],
  "consider": [
    { pos: "vt. & vi.", meanings: [["考虑", "common", 0], ["把（某人", "common", 0], ["某事）看作…", "common", 0], ["认为（某人", "normal", 0], ["某事）如何", "normal", 0], ["细想", "normal", 0]] },
    { pos: "vt.", meanings: [["考虑", "common", 0], ["认为", "common", 0], ["看重", "normal", 0], ["以为", "common", 0]] },
    { pos: "vi.", meanings: [["仔细考虑", "normal", 0], ["深思", "normal", 0]] }
  ],
  "deal": [
    { pos: "vt.", meanings: [["[牌戏]分", "rare", 0], ["分配", "normal", 0], ["经营", "normal", 0], ["施予", "normal", 0]] },
    { pos: "n.", meanings: [["（一笔）交易", "common", 0], ["许多", "common", 0], ["待遇", "normal", 0], ["发牌", "normal", 0]] },
    { pos: "vi.", meanings: [["论述", "normal", 0], ["（有效地或成功地）处理", "common", 0], ["惩处", "normal", 0], ["交易", "normal", 0]] },
    { pos: "adj.", meanings: [["冷杉木制的", "rare", 0], ["松木制的", "rare", 0]] }
  ],
  "depend": [
    { pos: "vi.", meanings: [["依靠", "common", 0], ["依赖", "common", 0], ["信赖", "common", 0], ["决定于", "common", 0]] }
  ],
  "develop": [
    { pos: "vi.", meanings: [["发展", "common", 0], ["生长", "common", 0], ["形成", "common", 0], ["发达", "normal", 0]] },
    { pos: "vt.", meanings: [["发展", "common", 0], ["开发", "common", 0], ["研制", "common", 0], ["冲洗（胶片）", "normal", 0]] }
  ],
  "draw": [
    { pos: "vt. & vi.", meanings: [["绘画", "common", 0], ["拖", "common", 0], ["拉", "common", 0], ["招致", "normal", 0], ["吸引", "common", 0]] },
    { pos: "vt.", meanings: [["画", "common", 0], ["拉", "common", 0], ["吸引", "common", 0]] },
    { pos: "vi.", meanings: [["移动", "normal", 0], ["拔出剑", "rare", 0], ["皱缩", "normal", 0], ["汲取", "normal", 0]] },
    { pos: "n.", meanings: [["平局", "common", 0], ["抽奖", "normal", 0]] }
  ],
  "drive": [
    { pos: "v.", meanings: [["驾驶", "common", 0], ["开车", "common", 0], ["驱动", "common", 0], ["迫使", "common", 0]] },
    { pos: "n.", meanings: [["驱车旅行", "common", 0], ["驱动力", "common", 0], ["车道", "normal", 0], ["驱动器", "normal", 0]] }
  ],
  "drop": [
    { pos: "vt. & vi.", meanings: [["（使）落下", "common", 0], ["投下", "common", 0], ["（使）降低", "common", 0], ["减少", "common", 0]] },
    { pos: "vt.", meanings: [["放弃", "common", 0], ["停止", "common", 0], ["（故意）降下", "normal", 0], ["垂下（眼睛）", "normal", 0]] },
    { pos: "n.", meanings: [["滴", "common", 0], ["空投", "normal", 0], ["降落", "normal", 0], ["少量", "normal", 0]] },
    { pos: "vi.", meanings: [["（水或其他液体）滴", "normal", 0], ["结束", "normal", 0], ["（因受伤或死等）倒下", "normal", 0], ["退出", "normal", 0]] }
  ],
  "end": [
    { pos: "n.", meanings: [["<正>结果", "common", 0], ["端", "common", 0], ["终止", "common", 0], ["最后部分", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["结束", "common", 0], ["终止", "common", 0]] }
  ],
  "fall": [
    { pos: "v.", meanings: [["落下", "common", 0], ["跌倒", "common", 0], ["减少", "common", 0], ["沦陷", "normal", 0]] },
    { pos: "n.", meanings: [["落下", "common", 0], ["瀑布", "normal", 0], ["秋天", "common", 0], ["减少", "common", 0]] }
  ],
  "feel": [
    { pos: "vt.", meanings: [["感觉", "common", 0], ["认为", "common", 0], ["触摸", "common", 0], ["试探", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["感觉", "common", 0], ["觉得", "common", 0], ["认为", "common", 0], ["以为", "normal", 0], ["触摸", "common", 0]] },
    { pos: "n.", meanings: [["感觉", "common", 0], ["触摸", "common", 0], ["感受", "normal", 0], ["触觉", "normal", 0]] },
    { pos: "vi.", meanings: [["觉得", "common", 0], ["摸索", "normal", 0]] }
  ],
  "fight": [
    { pos: "vt. & vi.", meanings: [["战斗", "common", 0], ["斗争", "common", 0], ["打架", "common", 0], ["吵架", "common", 0]] },
    { pos: "n.", meanings: [["打架", "common", 0], ["吵架", "common", 0], ["战斗", "common", 0], ["斗志", "common", 0]] }
  ],
  "fill": [
    { pos: "vt. & vi.", meanings: [["（使）充满", "common", 0], ["（使）装满", "common", 0]] },
    { pos: "vt.", meanings: [["满足", "common", 0], ["配药", "normal", 0], ["（按订单）供应", "normal", 0], ["使充满（感情）", "normal", 0]] },
    { pos: "n.", meanings: [["填满…的量", "normal", 0], ["充分", "normal", 0], ["装填物", "normal", 0], ["路堤", "normal", 0]] }
  ],
  "follow": [
    { pos: "vt. & vi.", meanings: [["跟随", "common", 0], ["接着", "common", 0]] },
    { pos: "vt.", meanings: [["继承", "normal", 0], ["（按时间、顺序等）接着", "common", 0], ["从事", "normal", 0], ["采用", "normal", 0]] },
    { pos: "vi.", meanings: [["理解", "common", 0], ["发生兴趣", "normal", 0], ["由此产生", "normal", 0], ["跟着人（或物）去（或来）", "normal", 0]] },
    { pos: "n.", meanings: [["追随", "rare", 0], ["跟随", "rare", 0], ["[台球]推球", "rare", 0], ["跟球打法（使竿击的球在击中目的球后继续滚动的打法）", "rare", 0]] }
  ],
  "force": [
    { pos: "n.", meanings: [["力", "common", 0], ["武力", "common", 0], ["（社会）势力", "common", 0], ["魄力", "normal", 0]] },
    { pos: "vt.", meanings: [["强迫", "common", 0], ["强行", "common", 0], ["促使", "normal", 0], ["推动", "normal", 0], ["强奸", "rare", 0]] }
  ],
  "form": [
    { pos: "n.", meanings: [["形状", "common", 0], ["形式", "common", 0], ["外形", "common", 0], ["方式", "common", 0], ["表格", "common", 0]] },
    { pos: "vt.", meanings: [["形成", "common", 0], ["构成", "common", 0], ["组织", "normal", 0], ["塑造", "normal", 0]] },
    { pos: "vi.", meanings: [["形成", "common", 0], ["产生", "normal", 0], ["排队", "normal", 0], ["整队", "normal", 0]] }
  ],
  "grow": [
    { pos: "vt.", meanings: [["种植", "common", 0], ["扩大", "normal", 0], ["扩展", "normal", 0], ["增加", "common", 0]] },
    { pos: "vi.", meanings: [["生长", "common", 0], ["渐渐变得", "common", 0], ["逐渐开始", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["（使）留长", "normal", 0], ["蓄长", "normal", 0]] }
  ],
  "hang": [
    { pos: "vt.", meanings: [["悬挂", "common", 0], ["（被）绞死", "normal", 0], ["贴", "normal", 0], ["装饰", "normal", 0], ["使悬而未决", "normal", 0]] },
    { pos: "vi.", meanings: [["悬垂", "common", 0], ["被吊死", "normal", 0], ["附属", "normal", 0], ["依靠", "normal", 0], ["悬而未决", "normal", 0]] },
    { pos: "n.", meanings: [["悬挂的样子", "normal", 0], ["（动作的）暂停", "normal", 0], ["〈口〉大意", "rare", 0], ["要点", "rare", 0], ["〈口〉做法", "rare", 0], ["诀窍", "rare", 0]] }
  ],
  "help": [
    { pos: "vt. & vi.", meanings: [["帮助", "common", 0], ["有助于", "common", 0], ["有利于", "common", 0]] },
    { pos: "vt.", meanings: [["治疗", "normal", 0], ["避免", "normal", 0], ["招待（客人）", "normal", 0], ["给…盛（饭、菜）", "normal", 0]] },
    { pos: "n.", meanings: [["帮助", "common", 0], ["助手", "common", 0], ["补救办法", "normal", 0], ["有用", "normal", 0]] },
    { pos: "vi.", meanings: [["（在餐桌旁）招待", "rare", 0], ["侍应", "rare", 0], ["作仆人（或店员、服务员等）", "rare", 0]] },
    { pos: "int.", meanings: [["[呼救语]救命！", "normal", 0]] }
  ],
  "hit": [
    { pos: "vt. & vi.", meanings: [["打", "common", 0], ["打击", "common", 0], ["碰撞", "common", 0]] },
    { pos: "vt.", meanings: [["击（球）", "common", 0], ["（在精神上）打击（某人）", "common", 0], ["猜中", "common", 0], ["迎合", "normal", 0]] },
    { pos: "n.", meanings: [["打", "common", 0], ["打击", "common", 0], ["碰撞", "common", 0], ["（演出等）成功", "common", 0], ["批评", "rare", 0], ["讽刺", "rare", 0]] },
    { pos: "vi.", meanings: [["（风暴、疾病等）袭击", "common", 0], ["抨击", "normal", 0], ["（偶然）碰上", "normal", 0], ["（突然）想到（与 on", "normal", 0], ["upon 连用）", "normal", 0]] }
  ],
  "join": [
    { pos: "vt. & vi.", meanings: [["连接", "common", 0], ["联结", "common", 0], ["加入", "common", 0], ["参加", "common", 0]] },
    { pos: "vt.", meanings: [["结合", "common", 0], ["参与", "common", 0], ["上（火车、飞机等）", "normal", 0], ["上（路）", "normal", 0]] },
    { pos: "n.", meanings: [["连接", "normal", 0], ["结合", "normal", 0], ["接合处", "normal", 0], ["接合点", "normal", 0]] }
  ],
  "lay": [
    { pos: "vt.", meanings: [["放置", "common", 0], ["铺放", "common", 0], ["涂", "normal", 0], ["敷", "normal", 0], ["产卵", "normal", 0]] },
    { pos: "adj.", meanings: [["世俗的", "rare", 0], ["外行的", "normal", 0], ["没有经验的", "normal", 0]] },
    { pos: "n.", meanings: [["叙事诗", "rare", 0], ["性伙伴", "rare", 0]] }
  ],
  "lead": [
    { pos: "vt.", meanings: [["领导", "common", 0], ["引导", "common", 0], ["指挥", "common", 0]] },
    { pos: "vi.", meanings: [["领导", "common", 0], ["导致", "common", 0], ["用水砣测深", "rare", 0]] },
    { pos: "n.", meanings: [["铅", "normal", 1], ["领导", "common", 0], ["榜样", "common", 0], ["枪弹", "rare", 0]] },
    { pos: "adj.", meanings: [["领头的", "normal", 0], ["最重要的", "normal", 0], ["领先的", "normal", 0]] }
  ],
  "learn": [
    { pos: "vt. & vi.", meanings: [["学习", "common", 0], ["学会", "common", 0], ["习得", "common", 0], ["得知", "common", 0], ["记住", "normal", 0]] },
    { pos: "vt.", meanings: [["记住", "normal", 0], ["学习", "common", 0], ["得知", "normal", 0], ["认识到", "normal", 0]] },
    { pos: "vi.", meanings: [["学习", "common", 0], ["获知", "normal", 0]] }
  ],
  "lie": [
    { pos: "v.", meanings: [["躺", "common", 0], ["坐落在", "common", 0], ["处于…状态", "normal", 0], ["说谎", "common", 0]] },
    { pos: "n.", meanings: [["谎言", "common", 0], ["谎话", "common", 0], ["状态", "rare", 0], ["位置", "rare", 0]] }
  ],
  "lift": [
    { pos: "vt. & vi.", meanings: [["举起", "common", 0], ["抬起", "common", 0]] },
    { pos: "vt.", meanings: [["举起", "common", 0], ["提升", "common", 0], ["鼓舞", "normal", 0], ["抬起", "common", 0]] },
    { pos: "vi.", meanings: [["消散", "normal", 0], ["升起", "normal", 0], ["耸立", "normal", 0]] },
    { pos: "n.", meanings: [["电梯", "common", 0], ["举起", "common", 0], ["起重机", "normal", 0], ["搭车", "normal", 0]] }
  ],
  "lock": [
    { pos: "n.", meanings: [["锁", "common", 0], ["水闸", "normal", 0], ["船闸", "normal", 0], ["（机器部件等的）锁定", "normal", 0], ["一把", "normal", 0], ["一撮", "normal", 0]] },
    { pos: "vt.", meanings: [["锁上", "common", 0], ["锁好", "common", 0], ["关好", "normal", 0], ["使固定", "normal", 0], ["隐藏", "normal", 0]] },
    { pos: "vi.", meanings: [["卡住", "normal", 0], ["不动", "normal", 0], ["纠结", "normal", 0], ["僵硬不动", "normal", 0]] }
  ],
  "lose": [
    { pos: "vt.", meanings: [["失去", "common", 0], ["错过", "common", 0], ["遗失", "common", 0], ["耽搁", "normal", 0]] },
    { pos: "vi.", meanings: [["损失", "common", 0], ["输掉", "common", 0], ["走慢", "normal", 0], ["降低价值", "normal", 0]] }
  ],
  "mark": [
    { pos: "n.", meanings: [["斑点", "common", 0], ["记号", "common", 0], ["成绩", "common", 0], ["标准", "normal", 0]] },
    { pos: "vt.", meanings: [["作记号", "common", 0], ["表示", "common", 0], ["给…打分", "normal", 0], ["在…留下痕迹", "normal", 0]] },
    { pos: "vi.", meanings: [["评分", "normal", 0], ["注意", "normal", 0], ["（比赛中）记分", "normal", 0]] }
  ],
  "match": [
    { pos: "n.", meanings: [["比赛", "common", 0], ["对手", "common", 0], ["相配的人（或物）", "normal", 0], ["火柴", "common", 0]] },
    { pos: "vt.", meanings: [["相同", "normal", 0], ["适应", "normal", 0], ["使较量", "rare", 0], ["使等同于", "rare", 0]] },
    { pos: "vt. & vi.", meanings: [["使相配", "normal", 0], ["使相称", "normal", 0]] }
  ],
  "miss": [
    { pos: "n.", meanings: [["（用于姓名或姓之前", "normal", 0], ["对未婚女子的称呼）小姐", "normal", 0], ["女士", "normal", 0], ["失误", "normal", 0]] },
    { pos: "v.", meanings: [["漏掉", "common", 0], ["错过（机会）", "common", 0], ["思念", "common", 0], ["没遇到", "common", 0]] }
  ],
  "note": [
    { pos: "n.", meanings: [["笔记", "common", 0], ["便笺", "common", 0], ["音符", "common", 0], ["钞票", "common", 0]] },
    { pos: "vt.", meanings: [["注意", "common", 0], ["记录", "common", 0], ["对…加注释", "normal", 0], ["指出", "normal", 0]] }
  ],
  "notice": [
    { pos: "n.", meanings: [["注意", "common", 0], ["布告", "common", 0], ["警告", "normal", 0], ["预告", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["注意", "common", 0]] },
    { pos: "vt.", meanings: [["通知", "normal", 0], ["留心", "normal", 0], ["关照", "normal", 0], ["注意到", "normal", 0]] },
    { pos: "vi.", meanings: [["引起注意", "normal", 0]] }
  ],
  "offer": [
    { pos: "vt.", meanings: [["提供", "common", 0], ["给予", "common", 0], ["提出", "common", 0], ["提议", "common", 0], ["出价", "normal", 0], ["开价", "normal", 0], ["表示愿意", "normal", 0]] },
    { pos: "vi.", meanings: [["提议", "normal", 0], ["企图", "rare", 0], ["想要", "rare", 0], ["供奉", "rare", 0]] },
    { pos: "n.", meanings: [["提议", "common", 0], ["出价", "common", 0], ["开价", "normal", 0], ["试图", "normal", 0], ["求婚", "normal", 0]] }
  ],
  "own": [
    { pos: "n.", meanings: [["自己的事物", "normal", 0], ["自己人", "normal", 0]] },
    { pos: "vt.", meanings: [["拥有", "common", 0], ["承认", "normal", 0]] },
    { pos: "vi.", meanings: [["承认", "normal", 0]] },
    { pos: "adj.", meanings: [["自己的", "common", 0], ["特有的", "normal", 0]] }
  ],
  "pay": [
    { pos: "vt. & vi.", meanings: [["付款", "common", 0], ["偿还", "common", 0], ["补偿", "normal", 0], ["（对…）有利", "normal", 0]] },
    { pos: "vt.", meanings: [["给予", "common", 0], ["支付", "common", 0]] },
    { pos: "n.", meanings: [["工资", "common", 0], ["薪水", "common", 0], ["报答", "normal", 0]] },
    { pos: "adj.", meanings: [["收费的", "normal", 0], ["需付费的", "normal", 0]] }
  ],
  "pick": [
    { pos: "vt. & vi.", meanings: [["挑选", "common", 0], ["挑拣", "common", 0], ["挖", "normal", 0], ["采", "normal", 0], ["摘", "normal", 0], ["剔", "normal", 0], ["扒", "rare", 0], ["挑剔", "normal", 0]] },
    { pos: "n.", meanings: [["选择", "common", 0], ["收获", "normal", 0], ["精华", "normal", 0]] }
  ],
  "place": [
    { pos: "n.", meanings: [["位", "common", 0], ["地方", "common", 0], ["职位", "common", 0], ["座位", "common", 0]] },
    { pos: "vt.", meanings: [["放置", "common", 0], ["获名次", "normal", 0], ["投资", "normal", 0], ["评价", "normal", 0]] },
    { pos: "vi.", meanings: [["得名次", "normal", 0], ["名列前茅", "normal", 0], ["[美国英语][赛马]得第二名", "rare", 0], ["准确把…推到预定地点", "rare", 0]] }
  ],
  "plan": [
    { pos: "n.", meanings: [["计划", "common", 0], ["打算", "common", 0], ["平面图", "normal", 0], ["示意图", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["计划", "common", 0], ["打算", "common", 0], ["设计", "normal", 0]] }
  ],
  "press": [
    { pos: "vt.", meanings: [["压", "common", 0], ["按", "common", 0], ["逼迫", "common", 0], ["紧抱", "normal", 0]] },
    { pos: "vi.", meanings: [["压", "normal", 0], ["逼迫", "normal", 0], ["重压", "normal", 0]] },
    { pos: "n.", meanings: [["强迫征兵", "rare", 0], ["新闻报道", "common", 0], ["出版物", "normal", 0], ["压榨", "normal", 0], ["印刷机（厂）", "normal", 0]] }
  ],
  "prove": [
    { pos: "vt.", meanings: [["证明", "common", 0], ["证实", "common", 0], ["[法]验证", "normal", 0], ["检定", "normal", 0], ["显示", "normal", 0]] },
    { pos: "vi.", meanings: [["显示出", "normal", 0], ["证明是", "normal", 0]] }
  ],
  "pull": [
    { pos: "vt. & vi.", meanings: [["拉", "common", 0], ["扯", "common", 0], ["拉过来", "common", 0], ["划（船）", "normal", 0]] },
    { pos: "vt.", meanings: [["赢得", "normal", 0], ["吸引异性", "normal", 0], ["取消", "normal", 0], ["（耍手腕）得逞", "normal", 0]] },
    { pos: "n.", meanings: [["拖", "normal", 0], ["爬", "normal", 0], ["影响力", "normal", 0]] }
  ],
  "push": [
    { pos: "vt. & vi.", meanings: [["推", "common", 0], ["推动", "common", 0]] },
    { pos: "vt.", meanings: [["推动", "common", 0], ["增加", "normal", 0], ["对…施加压力", "normal", 0], ["逼迫", "normal", 0], ["按", "normal", 0], ["说服", "normal", 0]] },
    { pos: "n.", meanings: [["推", "common", 0], ["决心", "normal", 0], ["大规模攻势", "normal", 0], ["矢志的追求", "normal", 0]] },
    { pos: "vi.", meanings: [["推进", "normal", 0], ["增加", "normal", 0], ["努力争取", "normal", 0]] }
  ],
  "record": [
    { pos: "n.", meanings: [["记录", "common", 0], ["记载", "common", 0], ["档案", "normal", 0], ["履历", "normal", 0], ["唱片", "common", 0], ["最高纪录", "common", 0]] }
  ],
  "refer": [
    { pos: "vi.", meanings: [["提到", "common", 0], ["针对", "normal", 0], ["关系到", "common", 0], ["请教", "normal", 0]] },
    { pos: "vt.", meanings: [["归因于…", "normal", 0], ["使求助于", "normal", 0], ["送交", "normal", 0], ["认为…起源于", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["参考", "common", 0], ["查阅", "common", 0]] }
  ],
  "regard": [
    { pos: "vt.", meanings: [["认为", "common", 0], ["注视", "common", 0], ["涉及", "common", 0], ["尊敬", "normal", 0]] },
    { pos: "vi.", meanings: [["凝视", "normal", 0], ["留意", "normal", 0]] },
    { pos: "n.", meanings: [["凝视", "normal", 0], ["留意", "normal", 0], ["尊敬", "normal", 0], ["问候", "common", 0]] }
  ],
  "remain": [
    { pos: "n.", meanings: [["剩余物", "normal", 0], ["残骸", "normal", 0], ["残余", "normal", 0], ["遗迹", "normal", 0], ["遗体", "normal", 0]] },
    { pos: "vi.", meanings: [["留下", "common", 0], ["保持", "common", 0], ["留待", "normal", 0], ["依然", "common", 0]] },
    { pos: "vi. & .", meanings: [["link-v.搁置", "normal", 0], ["剩余", "normal", 0], ["剩下", "normal", 0], ["逗留", "normal", 0], ["终属", "rare", 0], ["归于", "rare", 0]] }
  ],
  "remove": [
    { pos: "vt.", meanings: [["开除", "normal", 0], ["去除", "common", 0], ["脱掉", "common", 0], ["拿下", "common", 0], ["迁移", "normal", 0]] },
    { pos: "vi.", meanings: [["迁移", "normal", 0], ["移居", "normal", 0], ["离开", "normal", 0]] },
    { pos: "n.", meanings: [["距离", "normal", 0], ["差距", "normal", 0], ["移动", "normal", 0]] }
  ],
  "reply": [
    { pos: "n.", meanings: [["回答", "common", 0], ["答复", "common", 0], ["反应", "normal", 0], ["报复（行动）", "rare", 0], ["[法律]答辩", "rare", 0]] },
    { pos: "vi.", meanings: [["[法律]（原告对被告）答辩", "rare", 0], ["反响", "rare", 0], ["作答", "common", 0], ["（以行动）做出反应", "normal", 0]] },
    { pos: "vt.", meanings: [["回应", "normal", 0], ["作出反应", "normal", 0]] }
  ],
  "report": [
    { pos: "n.", meanings: [["报告", "common", 0], ["成绩报告单", "normal", 0], ["传闻", "normal", 0], ["流言蜚语", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["报道", "common", 0], ["公布", "common", 0], ["宣告", "normal", 0]] },
    { pos: "vt.", meanings: [["告发", "normal", 0], ["举报", "normal", 0], ["使报到", "normal", 0]] }
  ],
  "represent": [
    { pos: "vt.", meanings: [["表现", "common", 0], ["象征", "common", 0], ["代表", "common", 0], ["代理", "common", 0], ["扮演", "normal", 0], ["作为示范", "normal", 0]] },
    { pos: "vi.", meanings: [["代表", "normal", 0], ["提出异议", "normal", 0]] }
  ],
  "serve": [
    { pos: "vt. & vi.", meanings: [["（为…）服务", "common", 0], ["任（职）", "common", 0], ["提供", "common", 0], ["端上", "normal", 0]] },
    { pos: "vt.", meanings: [["招待", "normal", 0], ["（为…）工作", "normal", 0], ["对…有用", "normal", 0], ["向…供应", "normal", 0]] },
    { pos: "vi.", meanings: [["适合", "normal", 0], ["服役", "normal", 0], ["供职", "normal", 0], ["[网球、羽毛球]发球", "normal", 0]] },
    { pos: "n.", meanings: [["网球等发球", "normal", 0], ["发球权", "normal", 0], ["所发的球", "normal", 0]] }
  ],
  "speak": [
    { pos: "vt. & vi.", meanings: [["讲", "common", 0], ["谈", "common", 0], ["演说", "common", 0], ["从某种观点来说", "normal", 0]] }
  ],
  "spend": [
    { pos: "vt. & vi.", meanings: [["用钱", "common", 0], ["花钱", "common", 0]] },
    { pos: "vt.", meanings: [["花费", "common", 0], ["消耗", "common", 0], ["花（时间）", "common", 0], ["度过", "common", 0]] },
    { pos: "n.", meanings: [["（为某目的或某段时间内的）花销", "normal", 0], ["花费", "normal", 0], ["开销", "normal", 0]] }
  ],
  "spread": [
    { pos: "vt. & vi.", meanings: [["伸开", "common", 0], ["展开", "common", 0], ["（使）传播", "common", 0], ["（使）散布", "common", 0]] },
    { pos: "n.", meanings: [["范围", "normal", 0], ["连续的一段时间", "normal", 0]] },
    { pos: "vt.", meanings: [["涂", "normal", 0], ["把…覆盖在…上(over)", "normal", 0], ["把…敲平", "rare", 0], ["散发（气、烟等）", "normal", 0]] },
    { pos: "vi.", meanings: [["（景色、景致）展现", "normal", 0], ["传开", "common", 0], ["（人群）散开", "normal", 0], ["软化", "normal", 0]] },
    { pos: "adj.", meanings: [["张开的", "normal", 0], ["[语言学]双唇展开的", "rare", 0], ["（宝石）扁薄发光的", "rare", 0], ["（文章、照片等）跨两栏（或多栏）的", "rare", 0]] }
  ],
  "stick": [
    { pos: "vt. & vi.", meanings: [["粘贴", "common", 0], ["张贴", "common", 0], ["插入", "common", 0], ["刺入", "common", 0]] },
    { pos: "vt.", meanings: [["容忍", "common", 0], ["产生作用", "normal", 0], ["（尤指迅速或随手）放置", "normal", 0], ["阻延或推迟", "normal", 0]] },
    { pos: "n.", meanings: [["棍棒", "common", 0], ["棍枝", "normal", 0], ["枝条", "normal", 0], ["操纵杆", "normal", 0], ["球棍", "normal", 0]] }
  ],
  "strike": [
    { pos: "vt.", meanings: [["罢（工、课等）", "normal", 0], ["撞", "common", 0], ["攻击", "common", 0], ["来到", "common", 0]] },
    { pos: "vi.", meanings: [["罢工", "common", 0], ["打击", "common", 0], ["朝某一方向前进", "normal", 0]] },
    { pos: "n.", meanings: [["攻击", "normal", 0], ["罢工[课", "normal", 0], ["市]", "normal", 0], ["发现", "normal", 0]] }
  ],
  "contain": [
    { pos: "vt.", meanings: [["包含", "common", 0], ["容纳", "common", 0], ["克制", "normal", 0], ["遏制", "normal", 0], ["牵制", "normal", 0], ["包括或由…构成", "normal", 0]] }
  ],
  "continue": [
    { pos: "vi.", meanings: [["持续", "common", 0], ["逗留", "normal", 0], ["维持原状", "normal", 0]] },
    { pos: "vt.", meanings: [["延期", "normal", 0], ["使延伸", "normal", 0], ["使持续", "common", 0], ["继续说", "common", 0]] }
  ],
  "count": [
    { pos: "n.", meanings: [["总数", "common", 0], ["数数", "common", 0], ["罪状", "rare", 0], ["论点", "normal", 0]] },
    { pos: "v.", meanings: [["数数", "common", 0], ["计算总数", "common", 0], ["把…算入", "common", 0], ["重要", "common", 0]] }
  ],
  "create": [
    { pos: "vt.", meanings: [["创造", "common", 0], ["创作", "common", 0], ["产生", "common", 0], ["封爵", "rare", 0], ["把…封为（贵族）", "rare", 0]] },
    { pos: "vi.", meanings: [["[英][俚]大发脾气", "rare", 0], ["大发牢骚", "rare", 0]] }
  ],
  "decide": [
    { pos: "vt.", meanings: [["决定", "common", 0], ["决心", "common", 0], ["解决", "common", 0], ["裁决", "normal", 0]] },
    { pos: "vi.", meanings: [["决定", "common", 0], ["下决心", "common", 0]] }
  ],
  "declare": [
    { pos: "vt.", meanings: [["宣布", "common", 0], ["声明", "common", 0], ["声称", "common", 0], ["申报", "normal", 0], ["[法]供述", "rare", 0]] },
    { pos: "vi.", meanings: [["声明", "normal", 0], ["发表宣言", "normal", 0], ["宣称", "normal", 0]] }
  ],
  "defend": [
    { pos: "vt. & vi.", meanings: [["辩护", "common", 0], ["保卫", "common", 0], ["（足球、曲棍球等）防守", "normal", 0], ["进行辩护", "normal", 0]] }
  ],
  "define": [
    { pos: "vt.", meanings: [["规定", "common", 0], ["使明确", "normal", 0], ["精确地解释", "common", 0], ["画出…的线条", "normal", 0]] },
    { pos: "vi.", meanings: [["（给词、短语等）下定义", "common", 0], ["构成释义", "normal", 0]] }
  ],
  "deliver": [
    { pos: "vt.", meanings: [["发表", "common", 0], ["递送", "common", 0], ["交付", "common", 0], ["使分娩", "normal", 0]] },
    { pos: "vi.", meanings: [["投递", "normal", 0], ["传送", "normal", 0]] }
  ],
  "demand": [
    { pos: "vt.", meanings: [["要求", "common", 0], ["请求", "common", 0], ["需要", "common", 0], ["[法]召唤", "rare", 0], ["询问", "rare", 0], ["盘问", "rare", 0]] },
    { pos: "n.", meanings: [["需求", "common", 0], ["需要", "common", 0], ["要求", "common", 0], ["请求", "normal", 0], ["销路", "normal", 0]] },
    { pos: "vi.", meanings: [["需要", "normal", 0], ["请求", "normal", 0], ["查问", "normal", 0]] }
  ],
  "deny": [
    { pos: "vt.", meanings: [["拒绝", "normal", 0], ["拒绝承认", "common", 0], ["拒绝…占有", "rare", 0], ["否认知情", "normal", 0]] }
  ],
  "deserve": [
    { pos: "vt.", meanings: [["应受", "common", 0], ["应得", "common", 0], ["值得", "common", 0]] },
    { pos: "vi.", meanings: [["应受报答", "rare", 0], ["应得报酬", "rare", 0], ["应得赔偿", "rare", 0], ["应受惩罚", "rare", 0]] }
  ],
  "destroy": [
    { pos: "vt.", meanings: [["破坏", "common", 0], ["摧毁", "common", 0], ["消灭", "common", 0], ["歼灭（敌人）", "normal", 0], ["杀死", "normal", 0], ["使失败", "normal", 0]] }
  ],
  "determine": [
    { pos: "vt. & vi.", meanings: [["（使）下决心", "common", 0], ["（使）做出决定", "common", 0]] },
    { pos: "vt.", meanings: [["决定", "common", 0], ["确定", "common", 0], ["判定", "normal", 0], ["判决", "normal", 0], ["使决定", "normal", 0], ["限定", "normal", 0]] },
    { pos: "vi.", meanings: [["[主用于法律]了结", "rare", 0], ["终止", "rare", 0], ["结束", "rare", 0]] }
  ],
  "direct": [
    { pos: "adj.", meanings: [["直接的", "common", 0], ["直的", "common", 0], ["直系的", "normal", 0], ["率直的", "normal", 0]] },
    { pos: "adv.", meanings: [["直接地", "common", 0], ["径直地", "common", 0], ["直截了当地", "common", 0], ["正好", "normal", 0]] },
    { pos: "vt.", meanings: [["（用建议、指示、有益的情报等）指导", "common", 0], ["导演（戏剧或电影）", "common", 0], ["指示方向", "normal", 0], ["把…对准（某方向或某人）", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["指导", "normal", 0], ["导演", "normal", 0], ["管理", "normal", 0]] },
    { pos: "vi.", meanings: [["引路", "normal", 0], ["当向导", "normal", 0], ["领唱", "rare", 0], ["领奏", "rare", 0]] }
  ],
  "discover": [
    { pos: "vt.", meanings: [["发现", "common", 0], ["碰见", "common", 0], ["撞见", "common", 0], ["获得知识", "normal", 0]] }
  ],
  "discuss": [
    { pos: "vt.", meanings: [["讨论", "common", 0], ["谈论", "common", 0], ["论述", "common", 0], ["详述", "common", 0], ["商量", "normal", 0]] }
  ],
  "divide": [
    { pos: "vt. & vi.", meanings: [["分", "common", 0], ["划分", "common", 0], ["分离", "common", 0], ["（使）产生分歧", "normal", 0]] },
    { pos: "n.", meanings: [["分水岭", "normal", 0], ["分界线", "normal", 0], ["分配", "normal", 0]] }
  ],
  "double": [
    { pos: "adj.", meanings: [["双的", "common", 0], ["两倍的", "common", 0], ["两面派的", "rare", 0], ["双人用的", "normal", 0]] },
    { pos: "vt.", meanings: [["使加倍", "common", 0], ["把…对折", "normal", 0], ["重复", "normal", 0]] },
    { pos: "vi.", meanings: [["加倍", "common", 0], ["加倍努力", "rare", 0], ["快步走", "rare", 0]] },
    { pos: "adv.", meanings: [["两倍地", "common", 0], ["双重地", "normal", 0]] },
    { pos: "n.", meanings: [["两倍", "common", 0], ["双精度型", "rare", 0]] }
  ],
  "earn": [
    { pos: "vt. & vi.", meanings: [["赚得", "common", 0], ["获得", "common", 0], ["赢得", "common", 0], ["博得", "normal", 0]] },
    { pos: "vt.", meanings: [["赚", "common", 0], ["赚得", "common", 0], ["获得", "common", 0], ["挣得", "common", 0], ["使得到", "normal", 0]] }
  ],
  "employ": [
    { pos: "vt.", meanings: [["雇用", "common", 0], ["使用", "common", 0], ["利用", "common", 0]] },
    { pos: "n.", meanings: [["受雇", "normal", 0], ["服务", "rare", 0], ["工作", "normal", 0]] }
  ],
  "enable": [
    { pos: "vt.", meanings: [["使能够", "common", 0], ["提供做…的权利[措施]", "normal", 0], ["使可能", "common", 0], ["授予权利或方法", "normal", 0]] }
  ],
  "engage": [
    { pos: "vt.", meanings: [["吸引住", "common", 0], ["聘用", "common", 0], ["与…交战", "normal", 0]] },
    { pos: "vi.", meanings: [["与…建立密切关系", "normal", 0], ["衔接", "rare", 0], ["从事", "common", 0], ["紧密结合", "normal", 0]] }
  ],
  "enjoy": [
    { pos: "vt.", meanings: [["享有", "common", 0], ["享受", "common", 0], ["欣赏", "common", 0], ["喜欢", "common", 0], ["使过得快活", "normal", 0]] },
    { pos: "vi.", meanings: [["使过得快活", "normal", 0]] }
  ],
  "enter": [
    { pos: "vt. & vi.", meanings: [["进入", "common", 0], ["开始", "common", 0], ["参加", "common", 0], ["登记", "normal", 0]] }
  ],
  "establish": [
    { pos: "vt.", meanings: [["建立", "common", 0], ["创建", "common", 0], ["确立或使安全", "normal", 0], ["使被安排好", "normal", 0], ["使成为", "normal", 0]] }
  ],
  "examine": [
    { pos: "vt.", meanings: [["检查", "common", 0], ["调查", "common", 0], ["考试", "normal", 0], ["诊察", "normal", 0], ["审问", "normal", 0]] },
    { pos: "vi.", meanings: [["检查", "common", 0], ["调查", "common", 0]] }
  ],
  "exercise": [
    { pos: "n.", meanings: [["练习", "common", 0], ["运动", "common", 0], ["训练", "common", 0], ["运用", "normal", 0], ["典礼", "rare", 0]] },
    { pos: "vi.", meanings: [["锻炼", "common", 0], ["训练", "normal", 0], ["练习", "normal", 0]] },
    { pos: "vt.", meanings: [["锻炼（身体某部位）", "normal", 0], ["使焦虑", "normal", 0], ["使忧虑", "normal", 0], ["实行", "normal", 0], ["发挥（作用）", "normal", 0], ["运用", "normal", 0]] }
  ],
  "exist": [
    { pos: "vi.", meanings: [["存在", "common", 0], ["生存", "common", 0], ["生活", "common", 0], ["继续存在", "normal", 0]] }
  ],
  "expect": [
    { pos: "vt.", meanings: [["期望", "common", 0], ["预料", "common", 0], ["要求", "normal", 0], ["认为（某事）会发生", "normal", 0]] },
    { pos: "vi.", meanings: [["预期", "normal", 0], ["期待", "normal", 0], ["怀胎", "rare", 0], ["怀孕", "rare", 0]] }
  ],
  "explain": [
    { pos: "vt. & vi.", meanings: [["讲解", "common", 0], ["解释", "common", 0]] },
    { pos: "vt.", meanings: [["说明…的原因", "common", 0], ["辩解", "normal", 0]] },
    { pos: "vi.", meanings: [["说明", "normal", 0], ["解释", "normal", 0], ["辩解", "normal", 0]] }
  ],
  "express": [
    { pos: "v.", meanings: [["表达", "common", 0], ["表示", "common", 0], ["显而易见", "normal", 0], ["快递邮寄", "normal", 0]] },
    { pos: "adj.", meanings: [["特快的", "common", 0], ["迅速的", "normal", 0], ["用快递寄送的", "normal", 0], ["明确的", "normal", 0]] },
    { pos: "n.", meanings: [["特快列车", "common", 0], ["快递服务", "normal", 0]] },
    { pos: "adv.", meanings: [["使用快速服务", "rare", 0]] }
  ],
  "extend": [
    { pos: "vt. & vi.", meanings: [["延伸", "common", 0], ["扩大", "common", 0], ["推广", "normal", 0]] },
    { pos: "vt.", meanings: [["伸展", "common", 0], ["给予", "normal", 0], ["延长", "common", 0], ["发出（邀请、欢迎等）", "normal", 0]] },
    { pos: "vi.", meanings: [["伸出", "normal", 0], ["延伸", "common", 0], ["增加", "normal", 0]] }
  ],
  "fail": [
    { pos: "vt. & vi.", meanings: [["失败", "common", 0], ["不及格", "common", 0], ["倒闭", "common", 0], ["破产", "common", 0], ["缺乏", "normal", 0], ["衰退", "normal", 0]] },
    { pos: "vi.", meanings: [["衰退", "normal", 0], ["失败", "common", 0], ["不及格", "common", 0], ["破产", "normal", 0], ["不足", "normal", 0]] },
    { pos: "vt.", meanings: [["不及格", "normal", 0], ["使失望", "common", 0], ["忘记", "normal", 0], ["舍弃", "normal", 0]] },
    { pos: "n.", meanings: [["失败", "common", 0], ["失误", "normal", 0], ["不及格", "normal", 0], ["不及格者", "normal", 0], ["[商]期货交割失期", "rare", 0]] }
  ],
  "feed": [
    { pos: "vt.", meanings: [["喂养", "common", 0], ["满足（欲望等）", "normal", 0], ["向…提供", "normal", 0], ["供…作食物", "normal", 0]] },
    { pos: "vi.", meanings: [["吃", "common", 0], ["以…为食", "common", 0], ["流入", "normal", 0], ["注入", "normal", 0], ["进入（如油流入机器）", "normal", 0], ["[电子学]馈入", "rare", 0]] },
    { pos: "n.", meanings: [["饲料（尤指粗饲料）", "common", 0], ["施肥", "normal", 0], ["喂送", "normal", 0], ["草料", "normal", 0], ["（尤指向地方性电视台）馈送电视节目", "rare", 0]] }
  ],
  "fix": [
    { pos: "vt.", meanings: [["固定", "common", 0], ["准备", "common", 0], ["修理", "common", 0], ["使牢固", "common", 0]] },
    { pos: "vi.", meanings: [["固着", "normal", 0], ["变硬", "normal", 0], ["安定", "normal", 0]] },
    { pos: "n.", meanings: [["困境", "normal", 1], ["定位于", "rare", 0], ["受操纵的事", "rare", 0], ["应急措施", "normal", 0]] }
  ],
  "gain": [
    { pos: "vt. & vi.", meanings: [["获得", "common", 0], ["赢得", "common", 0], ["增加", "common", 0], ["（钟、表）走快", "normal", 0]] },
    { pos: "n.", meanings: [["利润", "common", 0], ["[土木工程]腰槽", "rare", 0], ["获益", "normal", 0]] },
    { pos: "vt.", meanings: [["（在…上）开腰槽", "rare", 0], ["吸引", "normal", 0], ["（通过努力）到达", "normal", 0], ["推进（一段距离）", "normal", 0]] },
    { pos: "vi.", meanings: [["增进", "normal", 0], ["增进健康", "normal", 0], ["得益", "normal", 0], ["（重量的）增加", "normal", 0]] }
  ],
  "gather": [
    { pos: "vt.", meanings: [["收集", "common", 0], ["聚集", "common", 0], ["搜集", "common", 0], ["收紧", "normal", 0], ["收缩", "normal", 0], ["采集", "normal", 0]] },
    { pos: "vi.", meanings: [["逐渐增加", "normal", 0], ["积聚", "normal", 0]] },
    { pos: "n.", meanings: [["聚集", "normal", 0], ["衣褶", "normal", 0]] }
  ],
  "guide": [
    { pos: "vt.", meanings: [["引路", "common", 0], ["指导", "common", 0], ["操纵", "normal", 0], ["影响", "normal", 0]] },
    { pos: "n.", meanings: [["指导者", "common", 0], ["向导", "common", 0], ["导游", "common", 0], ["有指导意义的事物", "normal", 0]] }
  ],
  "handle": [
    { pos: "n.", meanings: [["（织物、毛皮等的）手感", "normal", 0], ["手柄", "common", 0], ["举动", "normal", 0], ["柄状物", "normal", 0]] },
    { pos: "vi.", meanings: [["操作", "normal", 0], ["操控", "normal", 0], ["容易搬运", "normal", 0]] },
    { pos: "vt.", meanings: [["用双手触摸、举起或握住", "normal", 0], ["用手操作", "normal", 0], ["操纵", "normal", 0], ["处理或负责", "common", 0], ["管理", "normal", 0], ["〈美〉买卖", "normal", 0], ["经营", "normal", 0]] }
  ],
  "harm": [
    { pos: "n.", meanings: [["损害", "common", 0], ["伤害", "common", 0], ["危害", "common", 0]] },
    { pos: "vt.", meanings: [["伤害", "common", 0], ["损害", "common", 0], ["危害", "common", 0]] }
  ],
  "imagine": [
    { pos: "vt.", meanings: [["想", "common", 0], ["设想", "common", 0], ["想像", "common", 0], ["料想", "common", 0], ["猜想", "common", 0], ["误认为", "normal", 0]] },
    { pos: "vi.", meanings: [["想象", "normal", 0], ["猜想", "normal", 0], ["推测", "normal", 0]] }
  ],
  "imply": [
    { pos: "vt. & vi.", meanings: [["暗示", "common", 0], ["意味", "common", 0], ["隐含", "common", 0], ["说明", "normal", 0], ["表明", "common", 0]] }
  ],
  "improve": [
    { pos: "vt.", meanings: [["提高（土地、地产）的价值", "normal", 0], ["利用（机会）", "normal", 0], ["改善", "common", 0], ["改良", "common", 0]] },
    { pos: "vi.", meanings: [["变得更好", "common", 0], ["改进", "common", 0], ["改善", "common", 0]] }
  ],
  "include": [
    { pos: "vt.", meanings: [["包括", "common", 0], ["包含", "common", 0], ["计入", "normal", 0], ["包住", "normal", 0]] }
  ],
  "increase": [
    { pos: "vt. & vi.", meanings: [["增加", "common", 0], ["增大", "common", 0], ["增多", "common", 0]] },
    { pos: "vt.", meanings: [["增强", "normal", 0], ["增进", "normal", 0], ["[缝纫]放（针）", "rare", 0]] },
    { pos: "vi.", meanings: [["增强", "normal", 0], ["增进", "normal", 0], ["增殖", "normal", 0], ["繁殖", "normal", 0], ["[缝纫]放针", "rare", 0]] }
  ],
  "indicate": [
    { pos: "vt.", meanings: [["表明", "common", 0], ["标示", "common", 0], ["指示", "common", 0], ["象征", "normal", 0], ["暗示", "normal", 0], ["预示", "normal", 0], ["[医]显示需要做…的治疗", "rare", 0]] }
  ],
  "inform": [
    { pos: "vt.", meanings: [["通知", "common", 0], ["使活跃", "rare", 0], ["使充满", "rare", 0], ["预示", "rare", 0]] },
    { pos: "vi.", meanings: [["通知", "normal", 0], ["告发", "normal", 0]] }
  ],
  "insist": [
    { pos: "vt. & vi.", meanings: [["坚持", "common", 0], ["强调", "common", 0], ["坚决要求", "common", 0], ["坚决认为", "common", 0]] }
  ],
  "intend": [
    { pos: "vt.", meanings: [["意欲", "common", 0], ["计划", "common", 0], ["为特殊目的而设计", "normal", 0], ["为特定用途而打算", "normal", 0], ["意指或意味", "normal", 0]] },
    { pos: "vi.", meanings: [["怀有某种意图或目的", "normal", 0]] }
  ],
  "introduce": [
    { pos: "vt.", meanings: [["提出", "common", 0], ["介绍", "common", 0], ["引进", "common", 0], ["作为…的开头", "normal", 0]] }
  ],
  "invite": [
    { pos: "vt.", meanings: [["邀请", "common", 0], ["请求", "normal", 0], ["引诱", "normal", 0], ["招致", "normal", 0]] },
    { pos: "n.", meanings: [["邀请", "common", 0]] }
  ],
  "involve": [
    { pos: "vt.", meanings: [["包含", "common", 0], ["使参与", "common", 0], ["牵涉", "common", 0], ["围绕", "normal", 0], ["缠绕", "normal", 0], ["使专心于", "normal", 0]] }
  ],
  "last": [
    { pos: "n.", meanings: [["末尾", "common", 0], ["最后", "common", 0], ["上个", "common", 0], ["鞋楦（做鞋的模型）", "rare", 0]] },
    { pos: "vt.", meanings: [["经受住", "common", 0], ["到…之后", "normal", 0], ["够用", "common", 0], ["足够维持（尤指某段时间）", "normal", 0]] },
    { pos: "adj.", meanings: [["最近的", "common", 0], ["最后的", "common", 0], ["最不可能的", "normal", 0], ["惟一剩下的", "normal", 0]] },
    { pos: "vi.", meanings: [["持续", "common", 0]] },
    { pos: "adv.", meanings: [["上一次", "common", 0], ["最近一次", "common", 0], ["最后", "common", 0]] }
  ],
  "limit": [
    { pos: "n.", meanings: [["限制", "common", 0], ["限量", "normal", 0], ["限度", "common", 0], ["界限", "normal", 0]] },
    { pos: "vt.", meanings: [["限制", "common", 0], ["限定", "common", 0]] }
  ],
  "list": [
    { pos: "n.", meanings: [["清单", "common", 0], ["目录", "common", 0], ["倾斜", "normal", 0], ["布边", "rare", 0], ["布头", "rare", 0], ["狭条", "rare", 0]] },
    { pos: "vt.", meanings: [["列出", "common", 0], ["列入", "common", 0], ["把…编列成表", "normal", 0], ["记入名单内", "normal", 0]] },
    { pos: "vi.", meanings: [["列于表上", "normal", 0]] }
  ],
  "locate": [
    { pos: "vt.", meanings: [["位于", "common", 0], ["说出来源", "normal", 0], ["查找…的地点", "common", 0], ["确定…的位置", "common", 0]] },
    { pos: "vi.", meanings: [["定位", "normal", 0], ["定居", "normal", 0]] }
  ],
  "maintain": [
    { pos: "vt.", meanings: [["保持", "common", 0], ["保养", "common", 0], ["坚持", "common", 0], ["固执己见", "normal", 0]] }
  ],
  "manage": [
    { pos: "vt.", meanings: [["使用", "normal", 0], ["完成（困难的事）", "common", 0], ["经营", "common", 0], ["明智地使用（金钱、时间、信息等）", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["办理", "normal", 0], ["设法对付", "common", 0]] },
    { pos: "vi.", meanings: [["能解决（问题）", "normal", 0], ["应付（困难局面等）", "normal", 0], ["凑合着活下去", "normal", 0], ["支撑", "normal", 0]] }
  ],
  "mention": [
    { pos: "vt.", meanings: [["提到", "common", 0], ["说起", "common", 0], ["提名表扬", "normal", 0]] },
    { pos: "n.", meanings: [["提及", "common", 0]] }
  ],
  "name": [
    { pos: "n.", meanings: [["名字", "common", 0], ["名声", "common", 0], ["有…名称的", "normal", 0], ["著名的人物", "normal", 0]] },
    { pos: "vt.", meanings: [["确定", "normal", 0], ["决定", "normal", 0], ["给…取名", "common", 0], ["说出…的名字", "common", 0]] },
    { pos: "adj.", meanings: [["著名的", "normal", 0], ["据以取名", "rare", 0]] }
  ],
  "obtain": [
    { pos: "vt.", meanings: [["获得", "common", 0], ["得到", "common", 0], ["流行", "normal", 0], ["买到", "common", 0], ["达到（目的）", "normal", 0]] },
    { pos: "vi.", meanings: [["通行", "rare", 0], ["通用", "rare", 0], ["流行", "rare", 0], ["存在", "rare", 0]] }
  ],
  "occupy": [
    { pos: "vt.", meanings: [["占领", "common", 0], ["使用", "common", 0], ["住在…", "common", 0], ["使从事", "common", 0], ["使忙碌", "common", 0], ["任职", "normal", 0]] }
  ],
  "operate": [
    { pos: "vt. & vi.", meanings: [["运转", "common", 0], ["操作", "common", 0], ["经营", "common", 0], ["管理", "normal", 0]] },
    { pos: "vi.", meanings: [["开刀", "normal", 0], ["（对…）动手术", "normal", 0], ["动手术", "normal", 0], ["（在某地）采取军事行动", "normal", 0]] },
    { pos: "vt.", meanings: [["操作", "normal", 0], ["控制", "normal", 0], ["使运行", "normal", 0]] }
  ],
  "organize": [
    { pos: "v.", meanings: [["组织", "common", 0], ["安排", "common", 0], ["规划", "common", 0], ["建立组织", "normal", 0]] }
  ],
  "perform": [
    { pos: "vt. & vi.", meanings: [["执行", "common", 0], ["履行", "common", 0], ["表演", "common", 0], ["扮演", "common", 0]] },
    { pos: "vt.", meanings: [["工作", "normal", 0], ["做", "normal", 0], ["进行", "normal", 0], ["完成", "common", 0]] },
    { pos: "vi.", meanings: [["运行", "normal", 0], ["表现", "normal", 0], ["（驯兽）玩把戏", "rare", 0]] }
  ],
  "permit": [
    { pos: "vt.", meanings: [["许可", "common", 0], ["准许", "common", 0], ["默许", "normal", 0], ["放任", "normal", 0], ["允许", "common", 0], ["容许", "common", 0]] },
    { pos: "vi.", meanings: [["许可", "common", 0], ["允许", "common", 0]] },
    { pos: "n.", meanings: [["许可", "common", 0], ["准许", "common", 0], ["许可证", "common", 0], ["执照", "normal", 0]] }
  ],
  "persuade": [
    { pos: "vt. & vi.", meanings: [["说服", "common", 0], ["劝说", "common", 0], ["使相信", "common", 0], ["使信服", "common", 0]] }
  ],
  "prefer": [
    { pos: "vt.", meanings: [["更喜欢", "common", 0], ["提升", "rare", 0], ["提拔", "rare", 0], ["给予（债权人）优先权", "rare", 0], ["提出（控告）", "rare", 0]] },
    { pos: "vi.", meanings: [["更喜欢", "common", 0], ["宁愿", "common", 0]] }
  ],
  "prepare": [
    { pos: "vt.", meanings: [["准备", "common", 0], ["预备（饭菜）", "normal", 0], ["配备", "normal", 0], ["使（自己）有准备", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["筹备", "normal", 0], ["进行各项准备工作", "normal", 0], ["做好思想准备", "normal", 0], ["作出", "normal", 0], ["制订", "normal", 0], ["锻炼（身体等）", "normal", 0], ["训练", "normal", 0]] }
  ],
  "present": [
    { pos: "adj.", meanings: [["现在的", "common", 0], ["目前的", "common", 0], ["出席的", "common", 0], ["[语法学]现在时的", "rare", 0]] },
    { pos: "n.", meanings: [["现在", "common", 0], ["礼物", "common", 0], ["瞄准", "rare", 0]] }
  ],
  "prevent": [
    { pos: "vt.", meanings: [["预防", "common", 0], ["阻碍", "common", 0], ["阻止", "common", 0], ["[宗教]引领", "rare", 0]] },
    { pos: "vi.", meanings: [["阻挠", "normal", 0], ["阻止", "normal", 0]] }
  ],
  "produce": [
    { pos: "vt. & vi.", meanings: [["生产", "common", 0], ["产生", "common", 0], ["制作", "common", 0], ["创作", "normal", 0]] },
    { pos: "vt.", meanings: [["制造", "common", 0], ["出示", "common", 0], ["引起", "common", 0], ["[经济学]生利", "rare", 0]] },
    { pos: "n.", meanings: [["产品", "common", 0], ["产量", "normal", 0], ["产额", "normal", 0], ["结果", "normal", 0]] }
  ],
  "progress": [
    { pos: "n.", meanings: [["进步", "common", 0], ["前进", "common", 0], ["[生物学]进化", "rare", 0], ["（向更高方向）增长", "normal", 0]] },
    { pos: "v.", meanings: [["（使）进步", "common", 0], ["（使）进行", "common", 0], ["发展", "common", 0], ["促进", "normal", 0]] },
    { pos: "vi.", meanings: [["发展", "normal", 0], ["（向更高方向）增进", "normal", 0]] }
  ],
  "promote": [
    { pos: "vt.", meanings: [["促进", "common", 0], ["推进", "common", 0], ["提升", "common", 0], ["助长", "normal", 0], ["促销", "normal", 0], ["使（学生）升级", "normal", 0]] },
    { pos: "vi.", meanings: [["成为王后或其他大于卒的子", "rare", 0]] }
  ],
  "promise": [
    { pos: "vt.", meanings: [["允诺", "common", 0], ["许诺", "common", 0], ["给人以…的指望或希望", "normal", 0]] },
    { pos: "vi.", meanings: [["许诺", "common", 0], ["有指望", "normal", 0], ["有前途", "normal", 0]] },
    { pos: "n.", meanings: [["许诺", "common", 0], ["希望", "common", 0], ["指望", "normal", 0], ["允诺的东西", "normal", 0]] }
  ],
  "protect": [
    { pos: "vt.", meanings: [["保护", "common", 0], ["保卫", "common", 0], ["贸易保护", "normal", 0], ["备款以支付", "rare", 0]] }
  ],
  "provide": [
    { pos: "vt. & vi.", meanings: [["提供", "common", 0], ["供给", "common", 0], ["供应", "common", 0]] },
    { pos: "vt.", meanings: [["规定", "common", 0], ["提供(+for)", "normal", 0], ["装备", "normal", 0], ["预备", "normal", 0]] },
    { pos: "vi.", meanings: [["抚养", "normal", 0], ["赡养(+for)", "normal", 0], ["做准备", "normal", 0], ["预约(for 或 against)", "normal", 0]] }
  ],
  "publish": [
    { pos: "vt. & vi.", meanings: [["出版", "common", 0], ["发行", "common", 0], ["发表", "common", 0], ["宣布（结婚等）", "normal", 0], ["公布", "common", 0], ["颁布", "normal", 0], ["出版…的著作", "normal", 0]] }
  ],
  "pursue": [
    { pos: "vt.", meanings: [["继续", "common", 0], ["追求", "common", 0], ["进行", "common", 0], ["追捕", "common", 0]] },
    { pos: "vi.", meanings: [["追", "common", 0], ["追赶", "common", 0], ["继续进行", "normal", 0]] }
  ],
  "reduce": [
    { pos: "vt.", meanings: [["减少", "common", 0], ["缩小", "common", 0], ["使还原", "normal", 0], ["使变弱", "normal", 0]] },
    { pos: "vi.", meanings: [["减少", "common", 0], ["节食", "normal", 0], ["蒸发", "normal", 0], ["（液体）浓缩变稠", "normal", 0]] }
  ],
  "refuse": [
    { pos: "v.", meanings: [["拒绝", "common", 0], ["回绝", "common", 0], ["推却", "normal", 0]] },
    { pos: "n.", meanings: [["废弃物", "normal", 1], ["垃圾", "normal", 0]] }
  ],
  "relate": [
    { pos: "vt. & vi.", meanings: [["（把…）联系起来", "common", 0], ["讲", "normal", 0], ["叙述（故事等）", "normal", 0]] },
    { pos: "vt.", meanings: [["讲述", "normal", 0], ["叙述", "normal", 0], ["使…有联系", "common", 0], ["建立或展示联系", "normal", 0]] },
    { pos: "vi.", meanings: [["有联系", "common", 0], ["涉及", "common", 0], ["符合", "normal", 0], ["发生共鸣", "normal", 0]] }
  ],
  "like": [
    { pos: "vt.", meanings: [["喜欢", "common", 0], ["（与 would 或 should 连用表示客气）想", "common", 0], ["想要", "common", 0], ["喜欢做", "common", 0]] },
    { pos: "prep.", meanings: [["（表示属性）像", "common", 0], ["（表示方式）如同", "common", 0], ["（询问意见）…怎么样", "normal", 0], ["（表示列举）比如", "normal", 0]] },
    { pos: "adj.", meanings: [["相似的", "common", 0], ["相同的", "normal", 0]] },
    { pos: "n.", meanings: [["相类似的人[事物]", "normal", 0], ["喜好", "normal", 0], ["爱好", "normal", 0], ["（尤指被视为没有某人或某物那么好的）种类", "normal", 0], ["类型", "normal", 0]] },
    { pos: "conj.", meanings: [["像…一样", "common", 0], ["如同", "common", 0], ["好像", "common", 0], ["仿佛", "normal", 0]] },
    { pos: "adv.", meanings: [["（非正式口语", "normal", 0], ["代替 as）和…一样", "normal", 0], ["如", "normal", 0], ["思考说下句话、解释或举例时用）大概", "normal", 0], ["可能", "normal", 0]] }
  ],
  "in": [
    { pos: "prep.", meanings: [["采用（某种方式）", "common", 0], ["穿着", "common", 0], ["带着", "common", 0], ["（表示位置）在…里面", "common", 0], ["（表示领域", "normal", 0], ["范围）在…以内", "normal", 0], ["（表示品质、能力等）在…之中", "normal", 0]] },
    { pos: "adv.", meanings: [["在家", "common", 0], ["进入", "common", 0], ["到达", "normal", 0], ["流行", "normal", 0], ["当选", "rare", 0]] },
    { pos: "adj.", meanings: [["在内的", "common", 0], ["朝内的", "common", 0], ["在位的", "common", 0], ["执政的", "common", 0], ["[口语]流行的", "rare", 0], ["时髦的", "rare", 0], ["（车等）到站的", "rare", 0]] },
    { pos: "n.", meanings: [["执政党", "normal", 0], ["掌权者", "normal", 0], ["知情者", "normal", 0], ["<美口>入口", "rare", 0], ["门路", "rare", 0], ["<体>（板球或棒球）攻球的一方", "rare", 0]] }
  ],
  "up": [
    { pos: "adv.", meanings: [["在上面", "common", 0], ["在高处", "common", 0], ["起床", "common", 0], ["起来", "common", 0], ["向上", "common", 0], ["由低到高", "normal", 0]] },
    { pos: "adj.", meanings: [["向上的", "common", 0], ["上升的", "common", 0], ["竖立的", "common", 0], ["垂直的", "normal", 0], ["举起的", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["增加", "common", 0], ["加速", "normal", 0], ["提高", "normal", 0], ["举起", "common", 0], ["拿起", "normal", 0]] },
    { pos: "prep.", meanings: [["在…的上端", "normal", 0], ["向高处", "normal", 0], ["沿…而去", "normal", 0], ["向…上游", "rare", 0]] },
    { pos: "n.", meanings: [["上升", "common", 0], ["升高", "normal", 0], ["兴旺", "normal", 0], ["繁荣", "normal", 0], ["上坡", "rare", 0], ["（价格等）上涨", "normal", 0]] }
  ],
  "out": [
    { pos: "adv.", meanings: [["出局", "normal", 0], ["在外", "common", 0], ["在外部", "common", 0], ["完全", "common", 0], ["彻底", "normal", 0], ["出版", "normal", 0]] },
    { pos: "prep.", meanings: [["（表示来源）从", "normal", 0], ["（从…里）出来", "common", 0], ["（表示不在原状态）脱离", "normal", 0], ["离去", "normal", 0]] },
    { pos: "vt.", meanings: [["使熄灭", "normal", 0], ["揭露", "normal", 0], ["驱逐", "normal", 0]] },
    { pos: "adj.", meanings: [["外面的", "common", 0], ["出局的", "normal", 0], ["下台的", "normal", 0], ["外围的", "normal", 0]] },
    { pos: "n.", meanings: [["不流行", "normal", 0], ["出局", "normal", 0]] }
  ],
  "down": [
    { pos: "adv.", meanings: [["（坐、倒、躺）下", "common", 0], ["向下", "common", 0], ["（表示范围或顺序的限度）下至", "normal", 0]] },
    { pos: "prep.", meanings: [["（从高处）向下", "common", 0], ["（表示位置）在…的下方", "common", 0], ["（表示方向）沿着…向下", "common", 0], ["（表示时间）自…以来", "rare", 0]] },
    { pos: "adj.", meanings: [["向下的", "common", 0], ["沮丧的", "common", 0], ["计算机或计算机系统停机", "normal", 0], ["（以…）落后于对手的", "rare", 0]] },
    { pos: "n.", meanings: [["（鸟的）绒羽", "rare", 0], ["绒毛", "rare", 0], ["软毛", "normal", 0], ["汗毛", "normal", 0]] },
    { pos: "vt.", meanings: [["放下", "common", 0], ["（尤指大口或快速地）喝下", "normal", 0], ["使摔倒", "normal", 0], ["击落（敌机等）", "normal", 0]] },
    { pos: "vi.", meanings: [["[常用于祈使句中]下去", "normal", 0], ["下来", "normal", 0], ["卧倒", "normal", 0], ["下降", "normal", 0]] }
  ],
  "over": [
    { pos: "prep.", meanings: [["（表示方向）越过", "common", 0], ["（部份或全部覆盖）在…上面", "common", 0], ["由于", "normal", 0], ["（表示论及）关于", "normal", 0]] },
    { pos: "adv.", meanings: [["结束", "common", 0], ["再", "common", 0], ["（倒）下", "normal", 0], ["从一边至另一边", "normal", 0]] },
    { pos: "adj.", meanings: [["过去的", "common", 0], ["外面的", "normal", 0], ["在上的", "normal", 0], ["上级的", "normal", 0]] },
    { pos: "n.", meanings: [["额外", "normal", 0], ["剩余", "normal", 0], ["剩余（或多余）的量", "normal", 0], ["剩余物", "normal", 0]] },
    { pos: "int.", meanings: [["[电信学]报文完", "rare", 0], ["请回复！", "rare", 0]] },
    { pos: "vt.", meanings: [["走过", "normal", 0], ["跳过", "normal", 0], ["[美国方言]从…恢复过来", "rare", 0]] }
  ],
  "all": [
    { pos: "adj.", meanings: [["全部的", "common", 0], ["一切的", "common", 0], ["各种的", "common", 0], ["极度的", "normal", 0], ["尽量的", "normal", 0]] },
    { pos: "pron.", meanings: [["全部", "common", 0], ["一切", "common", 0], ["每个人", "common", 0], ["每件东西", "common", 0], ["全部情况", "normal", 0]] },
    { pos: "adv.", meanings: [["全部地", "common", 0], ["完全地", "common", 0], ["每个", "normal", 0], ["非常", "normal", 0]] },
    { pos: "n.", meanings: [["全体", "common", 0], ["[常作A-]整体", "normal", 0], ["[常与my", "normal", 0], ["your", "normal", 0], ["his", "normal", 0], ["her等连用]（某人）所有的一切", "normal", 0]] }
  ],
  "so": [
    { pos: "adv.", meanings: [["这样", "common", 0], ["很", "common", 0], ["（表示程度）这么", "common", 0], ["同样", "normal", 0]] },
    { pos: "conj.", meanings: [["（表示因果关系）因此", "common", 0], ["（表示目的）为了", "normal", 0], ["（引出下文）", "normal", 0], ["（认为某事无关紧要", "normal", 0], ["尤用于反驳他人的指责时）（口语）", "normal", 0]] },
    { pos: "pron.", meanings: [["如此", "normal", 0], ["这样", "normal", 0], ["大约", "normal", 0], ["左右", "rare", 0]] },
    { pos: "int.", meanings: [["[表示同意、赞成等] 好啦", "rare", 0], ["就这样吧！停下！（停住）别动！", "rare", 0], ["[表示惊讶、冷淡等] 哦", "rare", 0], ["真的吗", "rare", 0]] },
    { pos: "adj.", meanings: [["真的", "normal", 0], ["事实如此的", "normal", 0], ["如此的", "normal", 0], ["整齐的", "rare", 0]] }
  ],
  "good": [
    { pos: "adj.", meanings: [["好的", "common", 0], ["优秀的", "common", 0], ["有益的", "common", 0], ["漂亮的", "normal", 0], ["健全的", "normal", 0]] },
    { pos: "n.", meanings: [["好处", "common", 0], ["利益", "common", 0], ["善良", "normal", 0], ["善行", "normal", 0], ["好人", "normal", 0]] },
    { pos: "adv.", meanings: [["同well", "normal", 0]] }
  ],
  "think": [
    { pos: "vt.", meanings: [["想", "common", 0], ["思索", "common", 0], ["以为", "common", 0], ["看待", "common", 0]] },
    { pos: "vi.", meanings: [["思辩", "normal", 0], ["考虑", "common", 0], ["构想", "normal", 0], ["回忆", "normal", 0]] },
    { pos: "adj.", meanings: [["深思的", "normal", 0], ["供思考的", "normal", 0]] },
    { pos: "n.", meanings: [["想", "common", 0], ["想法", "common", 0]] }
  ],
  "love": [
    { pos: "vt. & vi.", meanings: [["爱", "common", 0], ["热爱", "common", 0], ["爱戴", "normal", 0], ["喜欢", "common", 0], ["赞美", "normal", 0], ["称赞", "normal", 0]] },
    { pos: "vt.", meanings: [["喜爱", "common", 0], ["喜好", "normal", 0], ["喜欢", "common", 0], ["爱慕", "normal", 0]] },
    { pos: "n.", meanings: [["爱情", "common", 0], ["爱意", "common", 0], ["疼爱", "normal", 0], ["热爱", "normal", 0], ["爱人", "normal", 0], ["所爱之物", "normal", 0]] }
  ],
  "show": [
    { pos: "vt. & vi.", meanings: [["给…看", "common", 0], ["表现出", "common", 0], ["显露出", "common", 0], ["上演", "normal", 0]] },
    { pos: "vt.", meanings: [["说明", "common", 0], ["指示", "common", 0], ["表明", "common", 0], ["演示", "normal", 0]] },
    { pos: "n.", meanings: [["展览", "common", 0], ["显示", "common", 0], ["外观", "normal", 0], ["表演", "common", 0]] },
    { pos: "vi.", meanings: [["被人看见", "normal", 0], ["显现", "normal", 0], ["显而易见", "normal", 0]] }
  ],
  "try": [
    { pos: "vt. & vi.", meanings: [["试图", "common", 0], ["努力", "common", 0], ["实验", "normal", 0], ["审判", "normal", 0], ["考验", "normal", 0]] },
    { pos: "n.", meanings: [["尝试", "common", 0], ["实验", "normal", 0], ["[橄]触球", "rare", 0], ["（因触球获得的）向球门踢球的权利", "rare", 0]] }
  ],
  "kill": [
    { pos: "vt. & vi.", meanings: [["杀死…", "common", 0]] },
    { pos: "vt.", meanings: [["使停止[结束", "common", 0], ["失败]", "common", 0], ["破坏", "common", 0], ["减弱", "normal", 0], ["抵消", "normal", 0], ["使痛苦", "normal", 0], ["使受折磨", "normal", 0], ["使笑得前仰后合", "normal", 0], ["使笑死了", "normal", 0]] },
    { pos: "n.", meanings: [["杀死", "common", 0], ["猎", "normal", 0], ["被捕杀的动物", "normal", 0], ["猎物", "normal", 0]] },
    { pos: "adj.", meanings: [["致命的", "common", 0]] }
  ],
  "care": [
    { pos: "v.", meanings: [["关心", "common", 0], ["担心", "common", 0], ["照顾", "common", 0], ["喜爱", "normal", 0]] },
    { pos: "n.", meanings: [["照顾", "common", 0], ["小心", "common", 0], ["忧虑", "normal", 0]] }
  ],
  "home": [
    { pos: "n.", meanings: [["家", "common", 0], ["家庭", "common", 0], ["家庭生活", "normal", 0], ["终点", "normal", 0]] },
    { pos: "adj.", meanings: [["家庭的", "common", 0], ["家用的", "common", 0], ["本地的", "normal", 0], ["本部的", "normal", 0]] },
    { pos: "adv.", meanings: [["在家", "common", 0], ["在家乡", "normal", 0], ["深深地", "rare", 0], ["深入地", "rare", 0]] },
    { pos: "vi.", meanings: [["回家", "normal", 0], ["有家", "normal", 0], ["朝向", "rare", 0], ["自动导航", "rare", 0]] },
    { pos: "vt.", meanings: [["把…送回家", "normal", 0], ["送…回家", "normal", 0], ["给…提供住处", "normal", 0], ["使有安身之处", "normal", 0]] }
  ],
  "part": [
    { pos: "n.", meanings: [["部分", "common", 0], ["零件", "common", 0], ["参加", "common", 0], ["地区", "normal", 0]] },
    { pos: "vt.", meanings: [["使分裂", "normal", 0], ["拆移", "rare", 0], ["使分开", "normal", 0]] },
    { pos: "vi.", meanings: [["分开", "common", 0], ["分离", "common", 0], ["分岔", "normal", 0]] },
    { pos: "adv.", meanings: [["不完全地", "normal", 0], ["部分地", "normal", 0]] },
    { pos: "adj.", meanings: [["不完全的", "normal", 0], ["部分的", "normal", 0]] }
  ],
  "case": [
    { pos: "n.", meanings: [["（实）例", "common", 0], ["事例", "common", 0], ["情况", "common", 0], ["状况", "common", 0], ["诉讼（事件）", "common", 0], ["案件", "common", 0], ["判例", "normal", 0], ["容器（箱", "normal", 0], ["盒）", "normal", 0]] },
    { pos: "vt.", meanings: [["把…装入箱（或盒等）内", "normal", 0], ["加盖于", "rare", 0], ["包围", "normal", 0], ["围住", "normal", 0], ["[俚语]（尤指盗窃前）探察", "rare", 0], ["侦查", "rare", 0], ["窥测", "rare", 0]] }
  ],
  "line": [
    { pos: "n.", meanings: [["线条", "common", 0], ["排", "common", 0], ["行列", "common", 0], ["界线", "common", 0]] },
    { pos: "vt.", meanings: [["排队", "normal", 0], ["用线标出", "normal", 0], ["沿…排列成行", "normal", 0], ["给…安衬里", "normal", 0]] },
    { pos: "vi.", meanings: [["形成一层", "normal", 0], ["排队", "normal", 0], ["击出平直球", "normal", 0]] }
  ],
  "fire": [
    { pos: "n.", meanings: [["火", "common", 0], ["燃烧物", "common", 0], ["火灾", "common", 0], ["射击", "common", 0], ["发射", "common", 0], ["热情", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["开火", "common", 0], ["射击", "common", 0], ["燃烧", "normal", 0], ["引爆炸药", "normal", 0], ["充满热情", "normal", 0]] },
    { pos: "vt.", meanings: [["<口>解雇", "common", 0], ["射（箭）", "normal", 0], ["激励", "normal", 0], ["射出（子弹）", "normal", 0]] }
  ],
  "cut": [
    { pos: "vt. & vi.", meanings: [["将（某物）切开（或分割）", "common", 0]] },
    { pos: "vt.", meanings: [["削减", "common", 0], ["剪切", "common", 0], ["切成", "common", 0], ["删剪", "normal", 0]] },
    { pos: "vi.", meanings: [["电影", "rare", 0], ["（为决定谁先出牌等）切牌", "rare", 0], ["可被切割", "normal", 0], ["可用于切割", "normal", 0]] },
    { pos: "n.", meanings: [["切口", "common", 0], ["削减", "common", 0], ["剪裁", "normal", 0], ["切片", "normal", 0]] }
  ],
  "sound": [
    { pos: "n.", meanings: [["声音", "common", 0], ["声响", "common", 0], ["音调", "common", 0], ["声调", "normal", 0], ["声波", "normal", 0], ["嘈杂声", "normal", 0]] },
    { pos: "vi.", meanings: [["响", "common", 0], ["发声", "common", 0], ["听起来", "common", 0], ["好像", "common", 0], ["回响", "normal", 0], ["[音乐]乐器等被奏响", "rare", 0]] },
    { pos: "vt.", meanings: [["使出声", "normal", 0], ["使发声", "normal", 0], ["清楚地发出", "normal", 0], ["宣布", "normal", 0], ["发表", "normal", 0], ["颂扬", "rare", 0]] },
    { pos: "adj.", meanings: [["健全的", "normal", 1], ["合理的", "normal", 0], ["完好的", "normal", 0], ["无损的", "normal", 0], ["明智的", "normal", 0]] },
    { pos: "adv.", meanings: [["彻底地", "normal", 0], ["充分地", "normal", 0]] }
  ],
  "top": [
    { pos: "n.", meanings: [["顶", "common", 0], ["顶部", "common", 0], ["（箱子）盖", "common", 0], ["（书页等的）上栏", "normal", 0], ["首席", "common", 0], ["陀螺", "normal", 0]] },
    { pos: "adj.", meanings: [["最高的", "common", 0], ["顶上的", "common", 0], ["头等的", "common", 0], ["最大的", "normal", 0]] },
    { pos: "vt.", meanings: [["形成顶部", "normal", 0], ["达到…的顶端", "common", 0], ["处于…的最前头", "normal", 0], ["领导", "normal", 0]] },
    { pos: "vi.", meanings: [["总结", "normal", 0], ["超越", "normal", 0], ["高耸", "normal", 0], ["结束", "normal", 0]] }
  ],
  "open": [
    { pos: "adj.", meanings: [["敞开的", "common", 0], ["开着的", "common", 0], ["公开的", "common", 0], ["公共的", "normal", 0], ["坦率的", "normal", 0], ["有议论余地的", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["（打）开", "common", 0], ["开始", "common", 0], ["睁开", "common", 0], ["启动", "common", 0]] },
    { pos: "n.", meanings: [["户外", "common", 0], ["野外", "normal", 0], ["空旷", "normal", 0], ["公开", "normal", 0]] },
    { pos: "vi.", meanings: [["使打开", "normal", 0], ["展示", "normal", 0], ["显现", "normal", 0]] },
    { pos: "vt.", meanings: [["张开", "common", 0], ["开放", "common", 0], ["开张营业", "normal", 0], ["为（建筑物）揭幕", "normal", 0]] }
  ],
  "back": [
    { pos: "n.", meanings: [["背", "common", 0], ["背部", "common", 0], ["背面", "common", 0], ["反面", "normal", 0], ["后面", "common", 0], ["后部", "common", 0], ["（椅子等的）靠背", "normal", 0]] },
    { pos: "vt.", meanings: [["使后退", "common", 0], ["支持", "common", 0], ["加背书于", "normal", 0], ["下赌注于", "normal", 0]] },
    { pos: "vi.", meanings: [["后退", "common", 0], ["倒退", "common", 0]] },
    { pos: "adj.", meanings: [["背部的", "common", 0], ["后面的", "common", 0], ["以前的", "normal", 0], ["拖欠的", "rare", 0]] },
    { pos: "adv.", meanings: [["以前", "common", 0], ["向后地", "common", 0]] }
  ],
  "long": [
    { pos: "adj.", meanings: [["长的", "common", 0], ["长时间的", "common", 0], ["冗长的", "common", 0], ["过长的", "normal", 0], ["长音的", "normal", 0]] },
    { pos: "adv.", meanings: [["长久地", "common", 0], ["始终", "normal", 0], ["遥远地", "normal", 0]] },
    { pos: "n.", meanings: [["长时间", "common", 0], ["长时期", "normal", 0], ["[语]长音节", "rare", 0], ["（服装的）长尺寸", "rare", 0], ["长裤", "rare", 0]] },
    { pos: "vi.", meanings: [["渴望", "normal", 1], ["极想", "normal", 0]] }
  ],
  "big": [
    { pos: "adj.", meanings: [["大的", "common", 0], ["重要的", "common", 0], ["（计划）庞大的", "normal", 0], ["大方的", "normal", 0]] },
    { pos: "adv.", meanings: [["大量地", "normal", 0], ["成功地", "normal", 0], ["夸大地", "normal", 0], ["宽宏大量地", "normal", 0]] },
    { pos: "n.", meanings: [["大亨", "normal", 0], ["大公司", "normal", 0]] }
  ],
  "room": [
    { pos: "n.", meanings: [["房间", "common", 0], ["空间", "common", 0], ["余地", "common", 0], ["房间里所有的人", "normal", 0]] },
    { pos: "vt.", meanings: [["租房", "normal", 0], ["合住", "normal", 0], ["为…提供住处", "normal", 0], ["投宿", "normal", 0], ["住宿", "normal", 0], ["留…住宿", "normal", 0]] }
  ],
  "family": [
    { pos: "n.", meanings: [["家庭", "common", 0], ["家族", "common", 0], ["孩子", "normal", 0], ["祖先", "rare", 0]] },
    { pos: "adj.", meanings: [["家庭的", "common", 0], ["一家所有的", "normal", 0], ["属于家庭的", "normal", 0], ["适合全家人的", "normal", 0]] }
  ],
  "school": [
    { pos: "n.", meanings: [["学校", "common", 0], ["上学", "common", 0], ["学院", "common", 0], ["群", "normal", 0]] },
    { pos: "vt.", meanings: [["训练", "common", 0], ["锻炼", "normal", 0], ["教育", "common", 0], ["教导", "normal", 0], ["约束", "normal", 0], ["给…上学", "rare", 0]] }
  ],
  "there": [
    { pos: "adv.", meanings: [["在那里", "common", 0], ["那里", "common", 0], ["在那一点上", "normal", 0]] },
    { pos: "pron.", meanings: [["表示某物或某人的存在或某事的发生（常用作be", "common", 0], ["seem或appear的主语）", "common", 0]] },
    { pos: "int.", meanings: [["（表示满足、烦恼）你瞧", "rare", 0], ["好啦", "rare", 0], ["得啦", "rare", 0]] }
  ],
  "here": [
    { pos: "adv.", meanings: [["在这里", "common", 0], ["这时", "common", 0], ["在这一点上", "common", 0], ["（给某人东西或指出某物时说）", "normal", 0]] },
    { pos: "n.", meanings: [["这里", "common", 0]] },
    { pos: "int.", meanings: [["喂", "rare", 0], ["嗨", "rare", 0]] }
  ],
  "how": [
    { pos: "adv.", meanings: [["怎样", "common", 0], ["健康状况如何", "normal", 0], ["到何种地步", "normal", 0], ["以任何方式", "normal", 0]] },
    { pos: "n.", meanings: [["方法", "normal", 0], ["方式", "normal", 0]] }
  ],
  "why": [
    { pos: "adv.", meanings: [["（用于问句）为什么", "common", 0], ["为何", "common", 0], ["（反问", "normal", 0], ["表示不必）何必", "normal", 0], ["（说明理由）为什么", "normal", 0]] },
    { pos: "int.", meanings: [["呵唷", "rare", 0], ["哎呀", "rare", 0], ["嗨", "rare", 0]] },
    { pos: "n.", meanings: [["理由", "normal", 0], ["原因", "normal", 0], ["说明", "normal", 0], ["难解的问题", "rare", 0]] }
  ],
  "will": [
    { pos: "n.", meanings: [["愿意", "common", 0], ["意志（力）", "common", 0], ["[法]遗嘱", "normal", 0]] },
    { pos: "vt.", meanings: [["决心要", "normal", 0], ["将（财产等）遗赠某人", "normal", 0], ["用意志力驱使（某事发生）", "normal", 0]] },
    { pos: "vi.", meanings: [["愿意", "normal", 0], ["希望", "normal", 0], ["想要", "normal", 0]] },
    { pos: "aux.", meanings: [["将", "common", 0], ["将会", "common", 0], ["会", "common", 0], ["要", "common", 0]] }
  ],
  "would": [
    { pos: "aux.", meanings: [["将", "common", 0], ["将要", "common", 0], ["愿意", "common", 0], ["会", "common", 0], ["打算", "normal", 0], ["大概", "normal", 0]] },
    { pos: "v.", meanings: [["(will 的过去式", "normal", 0], ["用于转述)将", "normal", 0]] }
  ],
  "should": [
    { pos: "-", meanings: [["应该", "common", 0], ["将会", "common", 0], ["可能", "common", 0], ["本应", "normal", 0]] }
  ],
  "could": [
    { pos: "aux.", meanings: [["“can”的过去式", "common", 0], ["能够", "common", 0], ["打算", "normal", 0], ["用于假设语气的条件句", "normal", 0], ["用于虚拟语气的结论句", "normal", 0]] }
  ],
  "may": [
    { pos: "aux.", meanings: [["可以", "common", 0], ["也许", "common", 0], ["会", "common", 0], ["但愿", "normal", 0]] },
    { pos: "n.", meanings: [["[May]五月", "common", 0], ["山楂属植物", "rare", 0], ["（五朔节装饰用的）绿枝花枝", "rare", 0], ["（春天开花的）绣线菊属植物", "rare", 0]] }
  ],
  "might": [
    { pos: "aux.", meanings: [["表示可能", "common", 0], ["表示许可", "normal", 0], ["表示询问情况", "normal", 0]] },
    { pos: "n.", meanings: [["力气", "common", 0], ["力量", "common", 0], ["威力", "normal", 0], ["权力", "normal", 0]] },
    { pos: "v.", meanings: [["可以", "normal", 0], ["应该", "normal", 0]] }
  ],
  "must": [
    { pos: "aux.", meanings: [["必须", "common", 0], ["必然要", "common", 0], ["（做出逻辑推断）", "normal", 0], ["（表示坚持）", "normal", 0]] },
    { pos: "n.", meanings: [["必须做的事", "common", 0], ["必不可少的事物", "normal", 0], ["葡萄汁", "rare", 0], ["霉臭", "rare", 0], ["麝香", "rare", 0]] },
    { pos: "vt. & vi.", meanings: [["（表示必要或很重要）必须", "common", 0], ["（提出建议）应该", "normal", 0], ["得", "normal", 0], ["（表示很可能或符合逻辑）一定", "normal", 0]] },
    { pos: "adj.", meanings: [["不可或缺的", "normal", 0], ["狂暴的", "rare", 0]] }
  ],
  "need": [
    { pos: "vt.", meanings: [["需要", "common", 0], ["必须", "normal", 0]] },
    { pos: "aux.", meanings: [["必须", "common", 0], ["不得不", "common", 0]] },
    { pos: "n.", meanings: [["需要", "common", 0], ["需要的东西", "common", 0], ["责任", "normal", 0], ["贫穷", "normal", 0]] },
    { pos: "vi.", meanings: [["（表示应该或不得不做）有必要", "normal", 0]] }
  ],
  "wish": [
    { pos: "v.", meanings: [["希望", "common", 0], ["想要", "common", 0], ["祝愿", "common", 0]] },
    { pos: "n.", meanings: [["愿望", "common", 0], ["希望", "common", 0], ["希望的事", "normal", 0], ["祝福", "normal", 0]] }
  ],
  "hope": [
    { pos: "n.", meanings: [["希望", "common", 0], ["期望", "common", 0], ["希望的东西", "normal", 0], ["被寄予希望的人或事物、情况", "normal", 0], ["抱有希望的理由", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["希望", "common", 0], ["期望", "common", 0]] },
    { pos: "vt.", meanings: [["[俚语]相信", "rare", 0], ["认为", "rare", 0]] },
    { pos: "vi.", meanings: [["希望", "normal", 0], ["盼望", "normal", 0], ["期待", "normal", 0]] }
  ],
  "know": [
    { pos: "v.", meanings: [["知道", "common", 0], ["了解", "common", 0], ["认识", "common", 0], ["确信", "common", 0]] },
    { pos: "n.", meanings: [["知情", "common", 0]] }
  ],
  "while": [
    { pos: "conj.", meanings: [["在…期间", "common", 0], ["与…同时", "common", 0], ["虽然", "common", 0], ["而", "common", 0]] },
    { pos: "n.", meanings: [["（一段）时间", "common", 0]] },
    { pos: "vt.", meanings: [["消磨", "normal", 0], ["打发（时间）", "normal", 0], ["（愉快而懒散地）度过（时间）（常与 away 连用）", "normal", 0]] }
  ],
  "after": [
    { pos: "prep.", meanings: [["…后的", "normal", 0], ["（表示时间）在…以后", "common", 0], ["（表示位置、顺序）在…后面", "common", 0]] },
    { pos: "conj.", meanings: [["在…以后", "common", 0]] },
    { pos: "adv.", meanings: [["以后", "common", 0], ["继后", "normal", 0]] },
    { pos: "adj.", meanings: [["后来的", "normal", 0], ["以后的", "normal", 0]] }
  ],
  "before": [
    { pos: "prep.", meanings: [["在…之前", "common", 0], ["先于", "common", 0], ["优于", "normal", 0], ["当着…的面", "normal", 0], ["与其…", "normal", 0]] },
    { pos: "conj.", meanings: [["在…之前", "common", 0], ["在…以前", "common", 0], ["比…早些", "normal", 0], ["与其…", "normal", 0]] },
    { pos: "adv.", meanings: [["先前", "common", 0], ["从前", "common", 0], ["在前", "normal", 0], ["在前方", "normal", 0]] }
  ],
  "around": [
    { pos: "adv.", meanings: [["大约", "common", 0], ["旋转", "normal", 0], ["到处", "common", 0], ["四处", "common", 0], ["在周围", "common", 0]] },
    { pos: "prep.", meanings: [["围绕", "common", 0], ["在附近", "common", 0], ["前后", "normal", 0], ["左右", "normal", 0], ["在…周围", "common", 0]] }
  ],
  "between": [
    { pos: "prep.", meanings: [["在…之间", "common", 0], ["私下", "normal", 0], ["暗中", "normal", 0], ["在…中任择其一", "normal", 0], ["来往于…之间", "normal", 0]] },
    { pos: "adv.", meanings: [["当中", "normal", 0], ["中间", "normal", 0]] }
  ],
  "without": [
    { pos: "adv.", meanings: [["在外部", "normal", 0], ["户外", "normal", 0], ["缺少", "normal", 0], ["没有或不显示某事物", "normal", 0]] },
    { pos: "prep.", meanings: [["没有", "common", 0], ["缺乏", "common", 0], ["在外面", "normal", 0]] },
    { pos: "conj.", meanings: [["除非", "normal", 0], ["如果不", "normal", 0]] }
  ],
  "through": [
    { pos: "prep.", meanings: [["通过", "common", 0], ["穿过", "common", 0], ["经由", "common", 0], ["透过", "common", 0], ["凭借", "normal", 0]] },
    { pos: "adv.", meanings: [["从头到尾", "common", 0], ["彻底", "common", 0], ["自始至终", "normal", 0]] },
    { pos: "adj.", meanings: [["（电话）接通", "normal", 0], ["通话完毕", "normal", 0], ["有洞的", "rare", 0], ["直达的", "normal", 0]] }
  ],
  "under": [
    { pos: "prep.", meanings: [["在…下面", "common", 0], ["在表面之下", "common", 0], ["在…的假定表面或掩饰下", "normal", 0], ["少于", "common", 0], ["小于", "common", 0], ["在…情况下", "normal", 0]] },
    { pos: "adv.", meanings: [["在下面", "common", 0], ["少于", "normal", 0], ["在水下", "normal", 0], ["在昏迷中", "rare", 0]] },
    { pos: "adj.", meanings: [["较低的", "normal", 0], ["下面的", "normal", 0]] }
  ],
  "inside": [
    { pos: "adj.", meanings: [["里面的", "common", 0], ["内部的", "common", 0], ["内幕的", "normal", 0], ["内侧的", "normal", 0]] },
    { pos: "n.", meanings: [["里面", "common", 0], ["内侧", "common", 0], ["内脏", "normal", 0], ["内容", "normal", 0], ["内幕", "normal", 0], ["（道路或跑道拐弯处的）内侧", "normal", 0]] },
    { pos: "adv.", meanings: [["在内地", "normal", 0], ["在内部地", "normal", 0], ["在内侧地", "normal", 0], ["在监狱里", "rare", 0]] },
    { pos: "prep.", meanings: [["在…以内", "common", 0], ["在内侧或内部", "normal", 0], ["进入里面", "normal", 0]] }
  ],
  "outside": [
    { pos: "adv.", meanings: [["在外面", "common", 0], ["向外面", "common", 0], ["在户外", "normal", 0], ["露天", "normal", 0]] },
    { pos: "n.", meanings: [["外面", "common", 0], ["（弯曲路面或轨道的）外道", "rare", 0], ["（靠近路中央的）外侧", "normal", 0], ["（建筑物等的）周围", "normal", 0]] },
    { pos: "adj.", meanings: [["外部的", "common", 0], ["集团外的", "normal", 0], ["（选择余地、可能性等）非常小", "rare", 0], ["可能性最大的", "rare", 0]] },
    { pos: "prep.", meanings: [["（表示位置）在[向]…的外面", "common", 0], ["（表示范围）超出…的范围", "normal", 0], ["（表示排斥）除了（某人）", "normal", 0]] }
  ],
  "behind": [
    { pos: "prep.", meanings: [["（表示位置）在…的后面", "common", 0], ["支持", "common", 0], ["（表示顺序）在身后", "common", 0], ["（表示比较）落后于", "normal", 0]] },
    { pos: "adv.", meanings: [["在后面", "common", 0], ["向后", "common", 0], ["在后面较远处", "normal", 0], ["（落）在后面", "normal", 0]] },
    { pos: "n.", meanings: [["〈口〉屁股", "rare", 0]] }
  ],
  "across": [
    { pos: "prep.", meanings: [["穿过", "common", 0], ["横穿", "common", 0], ["横过", "common", 0], ["与…交叉", "normal", 0], ["在…对面", "normal", 0]] },
    { pos: "adv.", meanings: [["横过", "common", 0], ["越过", "common", 0], ["在对面", "common", 0], ["交叉", "normal", 0], ["斜对面", "normal", 0]] }
  ],
  "along": [
    { pos: "adv.", meanings: [["一起", "common", 0], ["向前", "common", 0], ["进展", "normal", 0], ["到某处", "normal", 0]] },
    { pos: "prep.", meanings: [["沿着", "common", 0], ["顺着", "common", 0], ["靠着…边", "normal", 0]] }
  ],
  "near": [
    { pos: "adv.", meanings: [["（空间）在近处", "common", 0], ["在附近", "common", 0], ["（时间）临近", "common", 0], ["（程度）几乎", "normal", 0]] },
    { pos: "prep.", meanings: [["（表示程度）接近", "normal", 0], ["（表示位置）靠近", "common", 0], ["（表示时间）将近", "normal", 0], ["接近于（某种状态）", "normal", 0]] },
    { pos: "adj.", meanings: [["近的", "common", 0], ["亲密的", "common", 0], ["近似", "normal", 0], ["（亲属关系）近亲", "normal", 0]] }
  ],
  "since": [
    { pos: "prep.", meanings: [["从…以来", "common", 0], ["自从…之后", "common", 0], ["自从", "common", 0]] },
    { pos: "adv.", meanings: [["以后", "normal", 0], ["此后", "normal", 0], ["后来", "normal", 0], ["（距今几年）以前", "normal", 0], ["（从那时候起几年）以前", "normal", 0]] },
    { pos: "conj.", meanings: [["自从…以来", "common", 0], ["自从…的时候起", "common", 0], ["既然", "common", 0], ["因为", "common", 0]] }
  ],
  "people": [
    { pos: "n.", meanings: [["人", "common", 0], ["人类", "common", 0], ["居民", "common", 0], ["人民", "common", 0], ["种族", "normal", 0]] },
    { pos: "vt.", meanings: [["居住于", "normal", 0], ["布满", "normal", 0], ["使住满人", "normal", 0], ["在…殖民", "rare", 0], ["把动物放养在", "rare", 0]] }
  ],
  "friend": [
    { pos: "n.", meanings: [["朋友", "common", 0], ["友人", "common", 0], ["资助者", "normal", 0], ["助手", "normal", 0], ["近亲", "normal", 0]] },
    { pos: "v.", meanings: [["<诗>与…为友", "rare", 0]] }
  ],
  "child": [
    { pos: "n.", meanings: [["小孩", "common", 0], ["孩子", "common", 0], ["幼稚的人", "normal", 0], ["产物", "normal", 0], ["弟子", "rare", 0]] }
  ],
  "water": [
    { pos: "n.", meanings: [["水", "common", 0], ["雨水", "common", 0], ["海水", "common", 0], ["海域", "normal", 0]] },
    { pos: "v.", meanings: [["给…浇水", "common", 0], ["供以水", "normal", 0], ["加水稀释", "normal", 0], ["流泪", "normal", 0]] }
  ],
  "air": [
    { pos: "n.", meanings: [["天空", "common", 0], ["气氛", "common", 0], ["空运", "normal", 0], ["（简单易记的）曲调", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["晾晒", "common", 0], ["烘干", "common", 0], ["播送", "common", 0], ["广播", "common", 0]] },
    { pos: "vt.", meanings: [["使房间通风", "common", 0], ["透气", "normal", 0]] }
  ],
  "earth": [
    { pos: "n.", meanings: [["地球", "common", 0], ["陆地", "common", 0], ["泥土", "common", 0], ["兽穴", "rare", 0]] },
    { pos: "vt.", meanings: [["把（电线）接地", "normal", 0], ["盖（土）", "normal", 0], ["追赶入洞穴", "rare", 0]] },
    { pos: "vi.", meanings: [["躲进地洞", "rare", 0]] }
  ],
  "land": [
    { pos: "n.", meanings: [["陆地", "common", 0], ["国家", "common", 0], ["地产", "common", 0], ["土地", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["（使）登岸", "common", 0], ["降临", "common", 0], ["使陷于（困境）", "normal", 0], ["使不得不应付", "normal", 0]] },
    { pos: "vt.", meanings: [["自船上卸下", "normal", 0], ["获得", "normal", 0], ["捕到", "normal", 0], ["钓到（鱼）", "normal", 0]] },
    { pos: "vi.", meanings: [["跳落", "normal", 0], ["跌落", "normal", 0], ["被抛落（地面）", "normal", 0]] }
  ],
  "sea": [
    { pos: "n.", meanings: [["海", "common", 0], ["海洋", "common", 0], ["许多", "normal", 0], ["大量", "normal", 0]] }
  ],
  "city": [
    { pos: "n.", meanings: [["城市", "common", 0], ["全市居民", "normal", 0], ["（由国王或女王授予特权", "rare", 0], ["通常有大教堂的）特许市", "rare", 0], ["（由政府授予特权的）特权市", "rare", 0]] }
  ],
  "world": [
    { pos: "n.", meanings: [["世界", "common", 0], ["地球", "common", 0], ["领域", "common", 0], ["尘世", "normal", 0]] }
  ],
  "foot": [
    { pos: "n.", meanings: [["脚", "common", 0], ["底部", "common", 0], ["英尺(=12 英寸或 30。48 厘米)", "common", 0], ["脚步", "common", 0]] },
    { pos: "vt.", meanings: [["走", "normal", 0], ["踏", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["结算", "common", 0], ["总计", "normal", 0], ["共计", "normal", 0]] }
  ],
  "arm": [
    { pos: "n.", meanings: [["臂", "common", 0], ["武器", "common", 0], ["[复数]战事", "normal", 0], ["权力", "normal", 0]] },
    { pos: "vi.", meanings: [["准备（斗争）", "normal", 0], ["准备行动（against）", "normal", 0]] },
    { pos: "vt.", meanings: [["装备（防御工事）", "normal", 0], ["准备（攻击或迎击）", "normal", 0], ["配备", "common", 0], ["防护", "normal", 0]] }
  ],
  "leg": [
    { pos: "n.", meanings: [["腿", "common", 0], ["支柱", "normal", 0], ["支架", "normal", 0], ["裤腿", "common", 0], ["一段赛程", "normal", 0]] },
    { pos: "vi.", meanings: [["<口>走", "rare", 0], ["跑", "rare", 0]] }
  ],
  "ear": [
    { pos: "n.", meanings: [["耳朵", "common", 0], ["听觉", "common", 0], ["听力", "common", 0], ["耳状物", "normal", 0], ["穗", "normal", 0]] },
    { pos: "vi.", meanings: [["抽穗", "rare", 0], ["（美俚）听见", "rare", 0]] }
  ],
  "mouth": [
    { pos: "n.", meanings: [["口", "common", 0], ["出入口", "common", 0], ["传闻", "normal", 0]] },
    { pos: "vt.", meanings: [["装腔作势地说", "normal", 0], ["喃喃地说", "normal", 0], ["心不在焉地说", "normal", 0], ["言不由衷地说", "normal", 0]] },
    { pos: "vi.", meanings: [["装腔作势说话", "rare", 0]] }
  ],
  "nose": [
    { pos: "n.", meanings: [["鼻子", "common", 0], ["嗅觉", "common", 0], ["芳香", "normal", 0], ["香气", "normal", 0], ["突出的部分", "normal", 0]] },
    { pos: "vt.", meanings: [["嗅出", "normal", 0], ["闻出", "normal", 0], ["用鼻子触", "normal", 0], ["用鼻子品评（酒）等", "rare", 0], ["探出", "normal", 0]] },
    { pos: "vi.", meanings: [["小心探索着前进", "normal", 0], ["探问", "normal", 0]] }
  ],
  "hair": [
    { pos: "n.", meanings: [["头发", "common", 0], ["毛发", "common", 0], ["（动、植物的）毛", "common", 0], ["一丝丝", "normal", 0], ["些微", "normal", 0], ["毛发织物", "rare", 0]] }
  ],
  "body": [
    { pos: "n.", meanings: [["身体", "common", 0], ["尸体", "common", 0], ["团体", "common", 0], ["物体", "common", 0]] },
    { pos: "vt.", meanings: [["赋予形体", "rare", 0]] }
  ],
  "heart": [
    { pos: "n.", meanings: [["心", "common", 0], ["心脏", "common", 0], ["感情", "common", 0], ["要点", "common", 0], ["胸部", "normal", 0]] },
    { pos: "vt.", meanings: [["鼓励", "rare", 0], ["激励", "rare", 0]] },
    { pos: "vi.", meanings: [["结心", "rare", 0]] }
  ],
  "blood": [
    { pos: "n.", meanings: [["血", "common", 0], ["血液", "common", 0], ["流血", "common", 0], ["杀戮", "common", 0], ["杀人（罪）", "normal", 0], ["牺牲", "normal", 0], ["有…类型的血的", "normal", 0], ["血统", "common", 0], ["血气", "normal", 0], ["气质", "normal", 0]] },
    { pos: "vt.", meanings: [["用血染（皮革等）", "rare", 0], ["用血弄湿", "rare", 0], ["使出血", "rare", 0], ["抽…的血", "rare", 0], ["让新人初试做某事", "rare", 0], ["使先取得经验", "rare", 0]] }
  ],
  "brain": [
    { pos: "n.", meanings: [["脑", "common", 0], ["智慧", "common", 0], ["聪明的人", "common", 0], ["（群体中）最聪明的人", "normal", 0]] },
    { pos: "vt.", meanings: [["打破…的脑袋", "rare", 0], ["打…的头部", "rare", 0]] }
  ],
  "night": [
    { pos: "n.", meanings: [["夜", "common", 0], ["晚上", "common", 0], ["（举行盛事的）夜晚", "normal", 0]] }
  ],
  "day": [
    { pos: "n.", meanings: [["一天", "common", 0], ["白天", "common", 0], ["时期", "common", 0], ["节日", "normal", 0]] },
    { pos: "adj.", meanings: [["日间的", "normal", 0], ["逐日的", "normal", 0]] },
    { pos: "adv.", meanings: [["每天", "normal", 0], ["经常在白天地", "rare", 0]] }
  ],
  "week": [
    { pos: "n.", meanings: [["一星期", "common", 0], ["周", "common", 0], ["工作周（一个星期中的工作时间）", "normal", 0]] }
  ],
  "month": [
    { pos: "n.", meanings: [["月", "common", 0], ["月份", "common", 0], ["一个月的时间", "common", 0]] }
  ],
  "year": [
    { pos: "n.", meanings: [["年", "common", 0], ["年纪", "common", 0], ["一年的期间", "common", 0], ["某年级的学生", "normal", 0]] }
  ],
  "hour": [
    { pos: "n.", meanings: [["小时", "common", 0], ["钟头", "common", 0], ["时间", "common", 0], ["时刻", "common", 0], ["固定时间", "normal", 0], ["课时", "normal", 0]] }
  ],
  "second": [
    { pos: "n.", meanings: [["秒", "common", 0], ["瞬间", "common", 0], ["次货", "rare", 0], ["第二份食物", "rare", 0]] },
    { pos: "adj.", meanings: [["第二的", "common", 0], ["次要的", "common", 0], ["居第二位的", "normal", 0], ["另外的", "normal", 0]] },
    { pos: "adv.", meanings: [["第二", "common", 0], ["其次", "common", 0], ["以第二位", "normal", 0]] },
    { pos: "vt.", meanings: [["支持", "normal", 0], ["临时调派", "rare", 0], ["附议", "normal", 0], ["赞成提案", "normal", 0]] }
  ],
  "moment": [
    { pos: "n.", meanings: [["瞬间", "common", 0], ["片刻", "common", 0], ["时刻", "common", 0], ["重要", "normal", 0], ["紧要", "normal", 0], ["[物]力矩", "rare", 0]] }
  ],
  "question": [
    { pos: "n.", meanings: [["问题", "common", 0], ["疑问", "common", 0], ["怀疑", "common", 0], ["议题", "common", 0]] },
    { pos: "vt.", meanings: [["问（某人）问题", "common", 0], ["对（某事物）表示[感到]怀疑", "common", 0]] }
  ],
  "business": [
    { pos: "n.", meanings: [["商业", "common", 0], ["交易", "common", 0], ["生意", "common", 0], ["事务", "common", 0], ["业务", "common", 0], ["职业", "common", 0], ["行业", "common", 0]] }
  ],
  "market": [
    { pos: "n.", meanings: [["交易", "common", 0], ["市集", "common", 0], ["需求", "common", 0], ["交易情况", "common", 0], ["行情", "common", 0]] },
    { pos: "vt.", meanings: [["在市场上出售某物", "common", 0], ["推销", "common", 0]] },
    { pos: "vi.", meanings: [["<美>去市场买东西", "normal", 0]] }
  ],
  "money": [
    { pos: "n.", meanings: [["钱", "common", 0], ["财富", "common", 0], ["薪水", "common", 0], ["款项", "common", 0]] }
  ],
  "life": [
    { pos: "n.", meanings: [["生活", "common", 0], ["生计", "common", 0], ["生命", "common", 0], ["性命", "common", 0], ["一生", "common", 0], ["寿命", "common", 0], ["人生", "common", 0], ["尘世", "normal", 0]] }
  ],
  "death": [
    { pos: "n.", meanings: [["死亡", "common", 0], ["（某种）死法", "common", 0], ["死亡方式", "common", 0], ["病危", "normal", 0], ["死神", "normal", 0]] }
  ],
  "fact": [
    { pos: "n.", meanings: [["事实", "common", 0], ["实情", "common", 0], ["实际", "common", 0], ["真相", "common", 0], ["证据", "common", 0], ["犯罪行为", "normal", 0]] }
  ],
  "idea": [
    { pos: "n.", meanings: [["主意", "common", 0], ["想法", "common", 0], ["[哲]理念", "rare", 0], ["观念", "common", 0], ["[乐]乐句", "rare", 0], ["模糊想法", "normal", 0]] }
  ],
  "problem": [
    { pos: "n.", meanings: [["问题", "common", 0], ["疑难问题", "common", 0], ["习题", "common", 0], ["引起麻烦的人", "normal", 0]] },
    { pos: "adj.", meanings: [["成问题的", "normal", 0], ["难处理的", "normal", 0], ["关于社会问题的", "normal", 0]] }
  ],
  "answer": [
    { pos: "vt. & vi.", meanings: [["答复", "common", 0], ["解答", "common", 0], ["答辩", "common", 0], ["适应", "normal", 0]] },
    { pos: "n.", meanings: [["回答", "common", 0], ["答案", "common", 0], ["反应", "normal", 0], ["足以媲美的人", "normal", 0]] }
  ],
  "thing": [
    { pos: "n.", meanings: [["事件", "common", 0], ["形势", "common", 0], ["东西", "common", 0], ["事物", "common", 0], ["家伙", "normal", 0], ["事业", "normal", 0]] }
  ],
  "government": [
    { pos: "n.", meanings: [["政府", "common", 0], ["政体", "common", 0], ["治理的形式", "normal", 0], ["管辖", "common", 0], ["治理", "common", 0]] }
  ],
  "country": [
    { pos: "n.", meanings: [["国家", "common", 0], ["国民", "common", 0], ["乡下", "common", 0], ["地区", "common", 0]] }
  ],
  "age": [
    { pos: "n.", meanings: [["年龄", "common", 0], ["时代", "common", 0], ["老年", "normal", 0], ["年龄段", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["（使）长大", "normal", 0], ["使显老", "normal", 0], ["使变老", "common", 0], ["使苍老", "normal", 0]] },
    { pos: "vi.", meanings: [["[化学]老化", "normal", 0], ["陈化", "normal", 0], ["熟化", "normal", 0], ["（吸毒者随年龄增长而主动）戒毒", "rare", 0], ["戒除毒品", "rare", 0]] },
    { pos: "vt.", meanings: [["[化学]使老化", "normal", 0], ["使陈化", "normal", 0], ["使熟化", "normal", 0], ["估计", "rare", 0], ["推测（马的年龄）", "rare", 0]] }
  ],
  "university": [
    { pos: "n.", meanings: [["综合性大学", "common", 0], ["大学人员", "normal", 0], ["大学校舍", "normal", 0]] }
  ],
  "student": [
    { pos: "n.", meanings: [["学生", "common", 0], ["大学生", "common", 0], ["研究者", "normal", 0], ["学者", "normal", 0], ["中学生", "normal", 0], ["<美俚>初学者", "rare", 0]] }
  ],
  "teacher": [
    { pos: "n.", meanings: [["教师", "common", 0], ["教员", "common", 0], ["老师", "common", 0], ["先生", "normal", 0], ["[航]教练机", "rare", 0]] }
  ],
  "doctor": [
    { pos: "n.", meanings: [["医生", "common", 0], ["大夫", "common", 0], ["博士", "common", 0], ["神学家", "rare", 0], ["医疗设备", "rare", 0]] },
    { pos: "vt. & vi.", meanings: [["医疗", "normal", 0], ["行医", "normal", 0]] },
    { pos: "vt.", meanings: [["修理", "normal", 0], ["装配", "rare", 0], ["假造", "normal", 1], ["搀杂", "rare", 0], ["修改", "normal", 0], ["修饰", "normal", 0]] }
  ],
  "mother": [
    { pos: "n.", meanings: [["母亲", "common", 0], ["妈妈", "common", 0], ["女修道院院长", "rare", 0], ["大娘", "rare", 0]] },
    { pos: "vt.", meanings: [["像母亲般地照顾", "normal", 0], ["养育", "normal", 0], ["溺爱", "normal", 0]] }
  ],
  "father": [
    { pos: "n.", meanings: [["父亲", "common", 0], ["祖先", "common", 0], ["（尤指天主教和东正教的）神父", "normal", 0], ["天父", "normal", 0]] },
    { pos: "vt.", meanings: [["成为父亲", "normal", 0], ["创立（新思想）", "normal", 0], ["创造", "normal", 0], ["发明（新方法）", "normal", 0]] }
  ],
  "brother": [
    { pos: "n.", meanings: [["兄弟", "common", 0], ["同事", "common", 0], ["同胞", "common", 0], ["同志", "normal", 0]] },
    { pos: "int.", meanings: [["（表示生气或吃惊）我的老兄！", "rare", 0]] }
  ],
  "sister": [
    { pos: "n.", meanings: [["姐妹", "common", 0], ["（称志同道合者）姐妹", "normal", 0], ["修女", "normal", 0], ["护士", "normal", 0]] },
    { pos: "adj.", meanings: [["姐妹般的", "normal", 0], ["同类型的", "normal", 0]] },
    { pos: "v.", meanings: [["如姐妹般相待", "rare", 0]] }
  ],
  "wife": [
    { pos: "n.", meanings: [["妻子", "common", 0], ["太太", "common", 0], ["夫人", "common", 0], ["老婆", "common", 0], ["已婚妇女", "normal", 0]] }
  ],
  "husband": [
    { pos: "n.", meanings: [["丈夫", "common", 0], ["〈英〉管家", "rare", 0], ["〈古〉节俭的管理人", "rare", 0], ["船舶管理人", "rare", 0]] },
    { pos: "vt.", meanings: [["节俭地使用", "normal", 0], ["〈罕〉做…的丈夫", "rare", 0]] }
  ],
  "boy": [
    { pos: "n.", meanings: [["男孩", "common", 0], ["少年", "common", 0], ["儿子", "normal", 0], ["小伙子", "common", 0], ["家伙", "normal", 0], ["服务员", "rare", 0]] }
  ],
  "girl": [
    { pos: "n.", meanings: [["女孩", "common", 0], ["姑娘", "common", 0], ["未婚女子", "common", 0], ["女职员", "normal", 0], ["女演员", "normal", 0], ["（男人的）女朋友", "normal", 0]] }
  ],
  "woman": [
    { pos: "n.", meanings: [["女人", "common", 0], ["妇女", "common", 0], ["成年女子", "common", 0], ["女拥人或女下属", "normal", 0], ["女人本能", "normal", 0]] }
  ],
  "write": [
    { pos: "vt. & vi.", meanings: [["写", "common", 0], ["写信", "common", 0], ["写作", "common", 0], ["作曲", "normal", 0]] }
  ],
  "hear": [
    { pos: "vt. & vi.", meanings: [["听到", "common", 0], ["听见", "common", 0]] },
    { pos: "vt.", meanings: [["听说", "common", 0], ["得知", "common", 0], ["听取", "common", 0], ["审理", "normal", 0]] },
    { pos: "vi.", meanings: [["听", "common", 0], ["听见", "common", 0]] }
  ],
  "listen": [
    { pos: "vi.", meanings: [["倾听", "common", 0], ["留心听", "common", 0], ["听信", "normal", 0], ["（让对方注意）听着", "normal", 0]] },
    { pos: "n.", meanings: [["听", "common", 0], ["倾听", "normal", 0]] }
  ],
  "fly": [
    { pos: "vi.", meanings: [["飞", "common", 0], ["飞行", "common", 0], ["（旗）飘荡", "normal", 0], ["过得快", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["乘（…的）飞机", "common", 0], ["驾驶（飞机等）", "common", 0]] },
    { pos: "vt.", meanings: [["驾驶", "common", 0], ["空运", "common", 0], ["使飞翔", "normal", 0], ["操作", "normal", 0]] },
    { pos: "n.", meanings: [["苍蝇", "normal", 1], ["（作钓饵的）苍蝇", "normal", 0], ["（裤子的）前裆开口", "rare", 0], ["门帘", "rare", 0]] }
  ],
  "ride": [
    { pos: "vt. & vi.", meanings: [["乘", "common", 0], ["骑", "common", 0], ["驾", "common", 0]] },
    { pos: "n.", meanings: [["（乘坐汽车等的）旅行", "common", 0], ["乘骑", "common", 0], ["（乘车或骑车的）短途旅程", "common", 0], ["供乘骑的游乐设施", "normal", 0]] },
    { pos: "vt.", meanings: [["（骑马、自行车等）穿越", "normal", 0], ["搭乘", "normal", 0], ["飘浮", "normal", 0]] }
  ],
  "climb": [
    { pos: "v.", meanings: [["攀登", "common", 0], ["爬", "common", 0], ["登山", "common", 0], ["上升", "common", 0]] },
    { pos: "n.", meanings: [["攀登", "common", 0], ["山", "normal", 0], ["岩", "rare", 0], ["增值", "normal", 0], ["晋升", "normal", 0]] }
  ],
  "jump": [
    { pos: "vt.", meanings: [["跳", "common", 0], ["跳过", "common", 0], ["快速移动", "normal", 0], ["（因吃惊、害怕或激动而）猛地一动", "normal", 0]] },
    { pos: "vi.", meanings: [["暴涨", "common", 0], ["跳跃", "common", 0], ["猛增", "common", 0]] },
    { pos: "n.", meanings: [["猛长", "common", 0], ["暴涨", "common", 0], ["（需要跳越的）障碍", "normal", 0], ["跳伞", "normal", 0]] }
  ],
  "become": [
    { pos: "vi.", meanings: [["变为", "common", 0], ["成为", "common", 0], ["变得", "common", 0], ["变成", "common", 0]] },
    { pos: "vt.", meanings: [["适合", "normal", 0], ["适宜", "normal", 0], ["相称", "normal", 0], ["相当", "normal", 0], ["变成", "normal", 0], ["发生", "normal", 0]] }
  ],
  "begin": [
    { pos: "vt. & vi.", meanings: [["开始", "common", 0], ["着手", "common", 0], ["创始", "common", 0], ["创办", "normal", 0]] },
    { pos: "vi.", meanings: [["（从…）开始", "common", 0], ["起始", "common", 0], ["起初是", "normal", 0], ["开始讲话", "normal", 0]] }
  ],
  "buy": [
    { pos: "vt. & vi.", meanings: [["购买", "common", 0], ["购得", "common", 0]] },
    { pos: "n.", meanings: [["交易", "normal", 0], ["买卖", "normal", 0], ["便宜货", "common", 0]] },
    { pos: "vt.", meanings: [["够支付", "normal", 0], ["买通", "normal", 0], ["收买", "normal", 0], ["贿赂", "normal", 0]] }
  ],
  "paper": [
    { pos: "n.", meanings: [["纸", "common", 0], ["文件", "common", 0], ["论文", "common", 0], ["文章", "common", 0]] },
    { pos: "vt. & vi.", meanings: [["贴纸", "rare", 0]] },
    { pos: "vt.", meanings: [["包装", "normal", 0], ["用纸覆盖", "normal", 0], ["贴壁纸", "normal", 0], ["提供纸张", "rare", 0], ["[俚语] 提供免费入场券", "rare", 0]] },
    { pos: "vi.", meanings: [["贴糊墙纸", "rare", 0], ["发交通违章传票", "rare", 0]] },
    { pos: "adj.", meanings: [["纸制的", "normal", 0], ["似纸的", "normal", 0], ["有名无实的", "rare", 0]] }
  ],
  "news": [
    { pos: "n.", meanings: [["新闻", "common", 0], ["消息", "common", 0], ["（可当作新闻内容的）人", "normal", 0], ["物", "normal", 0]] }
  ],
  "letter": [
    { pos: "n.", meanings: [["信", "common", 0], ["证书", "common", 0], ["许可证", "common", 0], ["字母", "common", 0], ["文字", "common", 0], ["字面意义", "normal", 0]] },
    { pos: "vt.", meanings: [["用字母标明", "normal", 0], ["写字母于", "normal", 0], ["加标题", "normal", 0]] },
    { pos: "vi.", meanings: [["写印刷体字母", "rare", 0]] }
  ],
  "picture": [
    { pos: "n.", meanings: [["照片", "common", 0], ["画像", "common", 0], ["图画", "common", 0], ["图片", "common", 0], ["影片", "normal", 0], ["情景", "common", 0]] },
    { pos: "vt.", meanings: [["构想", "normal", 0], ["想象", "common", 0], ["描绘", "common", 0], ["画", "common", 0], ["描述", "normal", 0]] }
  ],
  "story": [
    { pos: "n.", meanings: [["故事", "common", 0], ["传说", "common", 0], ["历史", "normal", 0], ["沿革", "normal", 0], ["内情", "normal", 0], ["传记", "normal", 0]] },
    { pos: "vt.", meanings: [["用历史故事画装饰", "rare", 0], ["讲…的故事", "rare", 0], ["把…作为故事讲述", "rare", 0]] },
    { pos: "vi.", meanings: [["说谎", "normal", 0]] }
  ],
  "music": [
    { pos: "n.", meanings: [["音乐", "common", 0], ["乐曲", "common", 0], ["乐谱", "common", 0], ["乐队", "normal", 0]] }
  ],
  "art": [
    { pos: "n.", meanings: [["艺术", "common", 0], ["艺术作品", "common", 0], ["（需要技术、工艺的）行业", "normal", 0], ["文艺（包括绘画、雕塑、建筑、音乐、舞蹈、戏剧、文学等）", "normal", 0]] },
    { pos: "vi.", meanings: [["thou art 即 you are", "rare", 0], ["对一人讲话时用", "rare", 0]] },
    { pos: "adj.", meanings: [["艺术的", "normal", 0], ["（为）艺术家的", "normal", 0], ["艺术品的", "normal", 0], ["具有艺术性的", "normal", 0]] },
    { pos: "vt. & vi.", meanings: [["[口语]（把…）装饰得古色古香", "rare", 0], ["（把…）装饰得古怪而有艺术趣味", "rare", 0], ["把…装饰得有艺术价值", "rare", 0], ["把…加以艺术乔装", "rare", 0], ["使艺术化[仅用于 art up 短语中]", "rare", 0]] }
  ],
  "science": [
    { pos: "n.", meanings: [["科学", "common", 0], ["技术", "common", 0], ["知识", "normal", 0], ["学科", "normal", 0], ["理科", "normal", 0]] }
  ],
  "history": [
    { pos: "n.", meanings: [["历史", "common", 0], ["历史学", "common", 0], ["发展史", "common", 0], ["履历", "normal", 0], ["经历", "normal", 0], ["（某地的）沿革", "normal", 0]] }
  ],
  "nature": [
    { pos: "n.", meanings: [["自然", "common", 0], ["天性", "common", 0], ["天理", "rare", 0], ["类型", "normal", 0]] }
  ],
  "society": [
    { pos: "n.", meanings: [["社会", "common", 0], ["上流社会", "normal", 0], ["社团", "common", 0], ["社群", "normal", 0]] },
    { pos: "adj.", meanings: [["上流社会的", "normal", 0], ["社交界的", "normal", 0]] }
  ],
  "culture": [
    { pos: "n.", meanings: [["文化", "common", 0], ["[生物学]（微生物等的）培养", "normal", 0], ["修养", "normal", 0], ["养殖", "normal", 0]] },
    { pos: "vt.", meanings: [["培植", "normal", 0], ["培养", "normal", 0]] }
  ],
  "technology": [
    { pos: "n.", meanings: [["科技（总称）", "common", 0], ["工业技术", "common", 0], ["工艺学", "normal", 0], ["[总称]术语", "rare", 0]] }
  ],
  "economy": [
    { pos: "n.", meanings: [["节约", "normal", 0], ["经济", "common", 0], ["理财", "normal", 0], ["秩序", "rare", 0]] }
  ],
  "industry": [
    { pos: "n.", meanings: [["工业", "common", 0], ["产业（经济词汇）", "common", 0], ["工业界", "common", 0], ["勤劳", "normal", 0]] }
  ],
  "environment": [
    { pos: "n.", meanings: [["环境", "common", 0], ["外界", "common", 0], ["周围", "normal", 0], ["围绕", "normal", 0], ["工作平台", "normal", 0], ["（运行）环境", "normal", 0]] }
  ],
  "system": [
    { pos: "n.", meanings: [["体系", "common", 0], ["系统", "common", 0], ["制度", "common", 0], ["身体", "normal", 0], ["方法", "normal", 0]] }
  ],
  "process": [
    { pos: "n.", meanings: [["过程", "common", 0], ["工序", "common", 0], ["做事方法", "common", 0], ["工艺流程", "normal", 0]] },
    { pos: "vt.", meanings: [["加工", "common", 0], ["处理", "common", 0], ["审阅", "normal", 0], ["审核", "normal", 0]] },
    { pos: "vi.", meanings: [["列队行进", "rare", 0]] },
    { pos: "adj.", meanings: [["经过特殊加工（或处理）的", "normal", 0]] }
  ],
  "development": [
    { pos: "n.", meanings: [["发展", "common", 0], ["进化", "normal", 0], ["被发展的状态", "normal", 0], ["新生事物", "normal", 0], ["新产品", "normal", 0], ["开发区", "normal", 0]] }
  ],
  "research": [
    { pos: "n.", meanings: [["研究", "common", 0], ["追究", "normal", 0], ["探讨", "normal", 0], ["探测", "normal", 0], ["调查", "common", 0], ["探索", "normal", 0]] },
    { pos: "vi.", meanings: [["做研究", "common", 0], ["探究", "normal", 0], ["（从市场调研中）得出所预测的结果", "normal", 0]] },
    { pos: "vt.", meanings: [["从事…的研究", "common", 0], ["为…而做研究", "normal", 0]] }
  ]
};
