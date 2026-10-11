from pathlib import Path
import re
import math
out=Path(__file__).resolve().parent.parent / 'public/badges'
out.mkdir(parents=True, exist_ok=True)
# Original geometric illustrations: all paths authored for this project.
motifs=[
('seedling','萌芽', '<path d="M48 70V44M48 57C28 60 26 42 28 35c16 0 23 10 20 22ZM48 48c0-16 12-22 23-20 0 15-10 24-23 20Z"/><path d="M33 73h30"/>'),
('card-fan','初展', '<g transform="rotate(-20 48 53)"><rect x="26" y="31" width="30" height="43" rx="4" fill="#c97b58"/></g><g transform="rotate(20 48 53)"><rect x="40" y="31" width="30" height="43" rx="4" fill="#f0d9aa"/></g><rect x="33" y="28" width="30" height="43" rx="4"/><path d="m48 39 8 11-8 11-8-11Z" fill="#a43746" stroke="none"/>'),
('heart-bloom','心花', '<path d="M48 66C20 48 29 31 40 36l8 7 8-7c11-5 20 12-8 30Z" fill="#d36165"/><path d="M48 65v12M47 73c-9 1-16-3-19-10 10-2 17 2 19 10Zm2-3c8 0 14-4 17-10-9 0-15 3-17 10Z" fill="#85b899"/>'),
('scroll','学徒卷轴', '<path d="M30 33h35v38H36c-9 0-11-11-4-13h5V39c0-9-12-9-12-2h12M37 71h29c7 0 7-10 0-10H54"/><path d="M44 44h14M44 51h11" fill="none"/>'),
('open-book','智慧书', '<path d="M48 39c-9-6-17-8-27-5v34c10-3 18-1 27 5 9-6 17-8 27-5V34c-10-3-18-1-27 5Z"/><path d="M48 40v31M28 44l13 4M28 52l13 4M55 48l13-4M55 56l13-4" fill="none"/>'),
('quill','羽笔', '<path d="M33 69C35 40 54 28 71 29c-1 22-12 38-31 34Z"/><path d="m29 75 32-35M40 59l13-1M47 50l1-11" fill="none"/><path d="M48 76h22"/>'),
('woven-ribbon','巧结', '<path d="m30 34 33 33 9-9-33-33ZM24 58l33-33 9 9-33 33Z" fill="#88c4bb"/><path d="m29 70 9-9 7 7-10 10ZM57 68l7-7 10 9-6 8Z"/><circle cx="48" cy="47" r="7"/>'),
('compass','航向', '<circle cx="48" cy="52" r="24" fill="none"/><path d="m48 28 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z"/><path d="m48 35 0 17 11-11Z" fill="#b85360" stroke="none"/><circle cx="48" cy="52" r="4" fill="#fff2cc"/>'),
('bridge','布局桥', '<path d="M23 72V44h50v28H61V59c0-17-26-17-26 0v13ZM28 44V31h10v13M58 44V31h10v13"/><path d="M22 73h52M42 44V34h12v10"/><path d="M29 28h8M59 28h8"/>'),
('gold-key','解局之钥', '<circle cx="37" cy="43" r="14"/><circle cx="37" cy="43" r="6" fill="#285654"/><path d="m47 53 23 23 7-7-6-6-5 5-4-4 5-5-6-6-5 5-5-5Z"/>'),
('guardian','专家守护', '<path d="m48 27 22 8v19c0 12-11 22-22 27-11-5-22-15-22-27V35Z" fill="#7faead"/><path d="m48 36 10 14-10 17-10-17Z"/><path d="m35 50 8 9 17-19" fill="none" stroke="#fff1b8" stroke-width="4"/>'),
('hourglass','时光沙漏', '<path d="M31 28h34M31 77h34M35 30c0 14 1 16 13 23-12 7-13 10-13 22h26c0-12-1-15-13-22 12-7 13-9 13-23Z"/><path d="m39 37 9 12 9-12ZM40 71l8-12 8 12Z" fill="#cf9459" stroke="none"/>'),
('helm','职业战盔', '<path d="M27 68V48c0-26 42-26 42 0v20L54 78v-20H42v20Z"/><path d="M29 49h38M34 55h8M54 55h8" stroke="#304647"/><path d="M45 30V20h6v10" fill="#d57a62"/>'),
('firebird','焰羽', '<path d="M48 70C28 63 22 50 25 34l16 17-5-23 14 18 8-25 4 27 13-12c0 18-9 30-27 34Z" fill="#df9a55"/><path d="M48 73c-8-11-9-21 0-31 9 10 8 20 0 31Z" fill="#fff0b3"/><path d="m39 77 9-7 9 7"/>'),
('owl','洞察之眼', '<path d="m27 28 17 9h8l17-9v31c0 22-42 22-42 0Z" fill="#b29262"/><circle cx="37" cy="48" r="11"/><circle cx="59" cy="48" r="11"/><circle cx="37" cy="48" r="4" fill="#233e3c" stroke="none"/><circle cx="59" cy="48" r="4" fill="#233e3c" stroke="none"/><path d="m48 54 5 5-5 7-5-7Z"/><path d="m36 72 12-5 12 5" fill="none"/>'),
('royal-crown','大师冠冕', '<path d="m24 39 10 10 14-20 14 20 10-10-6 31H30Z"/><path d="M31 75h34M32 64h32"/><path d="m48 46 5 7-5 7-5-7Z" fill="#af4f69" stroke="none"/><circle cx="24" cy="35" r="4"/><circle cx="48" cy="25" r="4"/><circle cx="72" cy="35" r="4"/>'),
('shooting-star','星光', '<path d="m50 31 6 13 14 2-10 10 2 14-12-6-12 6 2-14-10-10 14-2Z"/><path d="m23 73 14-10M27 80l15-11M21 60l10-8" fill="none" stroke-width="4"/>'),
('lotus-jewel','王牌宝莲', '<path d="M48 75C27 69 21 56 25 46l17 14M48 75c21-6 27-19 23-29L54 60M48 75C32 62 34 46 48 33c14 13 16 29 0 42Z" fill="#84bdc2"/><path d="m48 32 10 14-10 17-10-17Z" fill="#d4f3eb"/>'),
('champion-cup','冠军圣杯', '<path d="M34 30h28v19c0 13-28 13-28 0ZM34 35H23v9c0 10 11 14 16 13M62 35h11v9c0 10-11 14-16 13M48 60v12M34 78h28l-5-6H39Z"/><path d="m48 36 3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1Z" fill="#b87748" stroke="none"/>'),
('lion','传奇雄狮', '<path d="m48 23 9 9 12 1 2 12 8 10-8 10-2 12-12 1-9 8-9-8-12-1-2-12-8-10 8-10 2-12 12-1Z" fill="#c7904e"/><path d="M32 41c0-14 32-14 32 0v19c0 19-32 19-32 0Z"/><path d="m37 48 7 3M52 51l7-3m-15 9h8l-4 6Zm-4 13 4 3 4-3" fill="none"/>'),
('winged-ace','宗师之翼', '<path d="M35 47 17 32c-2 19 1 30 18 36M61 47l18-15c2 19-1 30-18 36" fill="#b6d9cb"/><path d="m20 45 14 12M76 45 62 57" fill="none"/><rect x="35" y="27" width="26" height="48" rx="4"/><path d="M48 39c-2 7-12 11-10 17 1 5 7 4 10 1 3 3 9 4 10-1 2-6-8-10-10-17Zm0 19-4 8h8Z" fill="#295c50" stroke="none"/>'),
('solar-wheel','青铜日轮', '<path d="m48 23 5 10 10-5 1 12 12 1-6 10 8 8-12 4 1 12-12-3-7 10-7-10-12 3 1-12-12-4 8-8-6-10 12-1 1-12 10 5Z" fill="#d29562"/><circle cx="48" cy="52" r="17"/><circle cx="48" cy="52" r="9" fill="#ae663c"/><path d="M48 43v18M39 52h18" fill="none"/>'),
('moon-swan','白银月鹭', '<path d="M56 27c-29 0-35 43-8 49-36 4-45-54-8-55Z" fill="#dce5e0"/><path d="M42 68c0-10 8-19 19-19-7-13 1-25 10-20l-8 6c-1 9 12 15 9 25-4 15-23 19-30 8Z" fill="#a9c5d2"/><path d="m47 66 13-8M66 33l9 3-9 3" fill="none"/>'),
('golden-castle','黄金王城', '<path d="M24 73V37h8v8h7v-8h8v36Zm25 0V29h8v8h7v-8h8v44Z"/><path d="M22 76h53M33 73V59h7v14M57 53h7v12" fill="#98623a"/><path d="M60 28V19l12 5-12 4Z" fill="#edb985"/>'),
('diamond-orbit','钻石星域', '<ellipse cx="48" cy="53" rx="32" ry="12" transform="rotate(-25 48 53)" fill="none" stroke="#a5d9d7"/><path d="m29 43 10-13h18l10 13-19 32Z" fill="#a5ddda"/><path d="m29 43 19 32 19-32ZM39 30l-2 13 11 32 11-32-2-13M29 43h38" fill="none" stroke="#fff4cd"/><circle cx="23" cy="66" r="4"/><path d="M73 24v12M67 30h12" fill="none"/>'),
('monthly-bud','月度铜叶','<path d="M48 76V40M48 56C22 61 23 37 29 29c19 2 24 12 19 27Zm0 12c23 3 25-19 19-26-17 2-23 11-19 26Z" fill="#c39165"/><path d="m33 73 15 4 16-4" fill="none"/>'),
('monthly-blossom','月度银花','<path d="M48 33c-16-19-30 5-15 14-25 0-21 25-3 23-9 22 18 27 18 8 0 19 27 14 18-8 18 2 22-23-3-23 15-9 1-33-15-14Z" fill="#c5d8d9"/><circle cx="48" cy="57" r="11"/>'),
('monthly-harvest','月度金穗','<path d="M48 78V31M48 47c-14 0-17-7-16-15 12 0 17 7 16 15Zm0 0c14 0 17-7 16-15-12 0-17 7-16 15ZM48 63c-18 0-22-9-21-18 16 0 22 9 21 18Zm0 0c18 0 22-9 21-18-16 0-22 9-21 18Z"/><path d="m38 76 10 5 10-5" fill="none"/>'),
('monthly-perfect','完美月光','<circle cx="48" cy="52" r="24" fill="#c9c2ea"/><path d="m48 31 6 14 15 2-11 10 3 15-13-7-13 7 3-15-11-10 15-2Z"/><path d="m37 53 7 7 15-16" fill="none" stroke="#725e91" stroke-width="4"/>'),
]
palettes=[('#367d66','#163f35'),('#327a83','#183c4b'),('#706095','#302945'),('#913e59','#451f36'),('#538484','#223e50')]
for i,(slug,title,art) in enumerate(motifs):
    a,b=palettes[min(i//5,4)] if i<25 else [('#8c6843','#48382b'),('#698793','#2c4551'),('#997b3d','#4c3922'),('#77638c','#3c2e54')][i-25]
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 104" role="img"><title>{title}</title><defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1bd"/><stop offset=".3" stop-color="#d6a955"/><stop offset=".54" stop-color="#fff0b1"/><stop offset="1" stop-color="#a26d32"/></linearGradient><radialGradient id="enamel" cx=".35" cy=".25" r=".8"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></radialGradient><linearGradient id="ink" x2=".4" y2="1"><stop stop-color="#fff0b9"/><stop offset="1" stop-color="#d5a456"/></linearGradient></defs><path d="m28 73-4 27 15-7 9 9 1-25m18-4 5 27-15-7-9 9-1-25" fill="{b}" stroke="#c89b54" stroke-width="2"/><circle cx="48" cy="50" r="44" fill="#122c2a" opacity=".2"/><circle cx="48" cy="48" r="43" fill="url(#metal)"/><circle cx="48" cy="48" r="38" fill="url(#enamel)" stroke="#876633" stroke-width="1.5"/><circle cx="48" cy="48" r="34.5" fill="none" stroke="#efce87" stroke-opacity=".45"/><path d="M20 31A33 33 0 0 1 48 15" fill="none" stroke="#fff4cd" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/><g fill="url(#ink)" stroke="#e9c780" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" transform="translate(6 4) scale(.875)">{art}</g><path d="m48 7 3 4-3 4-3-4Zm0 74 3 4-3 4-3-4Z" fill="#fff1b8"/><circle cx="9" cy="48" r="2" fill="#fff1b8"/><circle cx="87" cy="48" r="2" fill="#fff1b8"/></svg>'''
    if i < 25:
        category = min(i // 5, 4)
        metals = [('#e5c19a','#af7449','#f3d7b5','#825339'), ('#f1f6f5','#a6b8bf','#fffdfa','#72858e'), ('#fff3bf','#d5a446','#fff5b9','#966324'), ('#fffaf0','#c6d3d5','#fffde7','#839aa0'), ('#f7e3ff','#b6abd9','#e9feff','#74658e')]
        light,mid,shine,dark=metals[category]
        svg=svg.replace('#fff1bd',light).replace('#d6a955',mid).replace('#fff0b1',shine).replace('#a26d32',dark)
        svg=svg.replace('viewBox="0 0 96 104"','viewBox="-8 -10 112 116"')
        if category == 0:
            svg=re.sub(r'<path d="m28 73.*?/>','',svg,count=1)
        frame=''
        # Decorations surround the enamel field, leaving the illustration clear.
        if category >= 1:
            for n in range(16):
                angle=2*math.pi*n/16
                x,y=48+40.5*math.cos(angle),48+40.5*math.sin(angle)
                frame+=f'<circle cx="{x:.2f}" cy="{y:.2f}" r=".8" fill="{shine}"/>'
        if category >= 2:
            for side in (-1,1):
                for n in range(5):
                    x=48+side*(35+n*1.7); y=78-n*7
                    frame+=f'<ellipse cx="{x}" cy="{y}" rx="3" ry="6" transform="rotate({side*35} {x} {y})" fill="{mid}" stroke="{shine}" stroke-width=".8"/>'
        if category >= 3:
            frame+=f'<path d="m35 11-3-12 9 6 7-12 7 12 9-6-3 12Z" fill="url(#metal)" stroke="{dark}" stroke-width="1.2"/><path d="M36 12h24" stroke="{shine}" stroke-width="2"/>'
            frame+=f'<path d="m8 48 5-7 5 7-5 7Zm70 0 5-7 5 7-5 7Z" fill="{shine}" stroke="{dark}"/>'
        if category == 4:
            accents=['#77d3b7','#efb585','#cadffb','#ffdf83','#c5b6ff']
            accent=accents[i-20]
            if i == 20:
                frame+=f'<path d="M15 38-4 24 0 46l12 20m69-28 19-14-4 22-12 20" fill="{accent}" stroke="{shine}" stroke-width="1.5"/><path d="m0 36 13 16m83 0 13-16" fill="none" stroke="{dark}"/>'
            elif i == 21:
                for n in range(12):
                    angle=2*math.pi*n/12
                    points=[(48+r*math.cos(angle+offset),48+r*math.sin(angle+offset)) for r,offset in [(44,-.065),(51,0),(44,.065)]]
                    frame+='<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+f'" fill="{accent}" stroke="{shine}" stroke-width=".7"/>'
            elif i == 22:
                frame+=f'<path d="M16 8C-13 32-9 70 20 87-3 49 0 29 16 8Zm64 0c29 24 25 62-4 79 23-38 20-58 4-79Z" fill="{accent}" stroke="{shine}" stroke-width="1"/>'
            elif i == 23:
                frame+=f'<path d="M9 36 1 26v41l15 17 32 13 32-13 15-17V26l-8 10" fill="none" stroke="{accent}" stroke-width="3"/><path d="m2 26 8-4 7 7m62 0 7-7 8 4" fill="none" stroke="{shine}" stroke-width="2"/>'
            else:
                frame+=f'<path d="m48-7 37 18 15 37-15 37-37 15L11 85-4 48 11 11Z" fill="none" stroke="{accent}" stroke-width="2.5"/><path d="M11 11 21 21M85 11 75 21M11 85l10-10m64 10L75 75" stroke="{shine}" stroke-width="2"/>'
            for x,y in [(48,5),(6,48),(90,48),(48,91)]:
                frame+=f'<path d="m{x} {y-4} 3 4-3 4-3-4Z" fill="{accent}" stroke="{shine}" stroke-width=".7"/>'
        svg=svg.replace('</svg>',frame+'</svg>')
    (out/f'{slug}.svg').write_text(svg)
(out/'README.md').write_text('''# 原创珐琅徽章\n\n本项目自行绘制的 SVG 插画，共 25 个等级徽章及 4 个每日挑战徽章。\n全部主体路径为本项目原创；没有下载、切割或描摹付费素材，也不依赖第三方图标。\n珐琅底色构成统一视觉语言；等级边框依次为素铜、刻银、桂冠金、冠饰铂金及宝石宗师框。五枚宗师徽章另有翼饰、日芒、月环、王庭及钻石切面轮廓，等级主体各不相同。\nSVG 使用内部渐变、固定颜色，无字体、外部资源、滤镜或动画。\n''')
labels=['初识纸牌', '新晋牌手', '入门牌手', '纸牌学徒', '熟练牌手', '稳健牌手', '巧手牌客', '解局能手', '布局行家', '策略高手', '资深牌手', '纸牌专家', '解局大师', '布局大师', '策略大师', '纸牌名家', '王牌名家', '卓越名家', '传奇牌手', '纸牌传奇', '空当宗师', '超凡宗师', '传奇宗师', '巅峰宗师', '永恒宗师']
frame_labels=['素铜框','刻银框','桂冠金框','冠饰铂金框','宝石宗师框']
items=''.join(f'<figure><img src="{slug}.svg" alt="{title}"/><figcaption>{labels[i] if i<25 else title}<small>{title}</small><small>{frame_labels[min(i//5,4)] if i<25 else "月度挑战"}</small></figcaption></figure>' for i,(slug,title,_) in enumerate(motifs))
(out/'gallery.html').write_text(f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原创珐琅徽章</title><style>body{{margin:0;padding:32px;background:#173c32;color:#f5edcc;font-family:system-ui,sans-serif}}h1{{font-size:24px}}p{{color:#bdd0bc}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:16px;max-width:1000px}}figure{{margin:0;padding:16px 8px;background:#ffffff08;border:1px solid #d8bc7133;border-radius:14px;text-align:center}}img{{width:96px;height:104px}}figcaption{{font-size:13px;margin-top:8px}}small{{display:block;color:#afc3aa;margin-top:5px;font-size:11px}}</style><h1>原创珐琅徽章</h1><p>25 个不同等级图案 · 4 个每日挑战图案 · SVG 矢量插画</p><main>{items}</main></html>''')
rank=', '.join("'"+x[0]+"'" for x in motifs[:25])
challenge=', '.join("'"+x[0]+"'" for x in motifs[25:])
(out.parent.parent/'src/BadgeEmblem.tsx').write_text(f'''const RANK_BADGES = [{rank}];
const CHALLENGE_BADGES = [{challenge}];

// Original standalone SVG illustrations. An image isolates each asset's
// gradient IDs and keeps artwork fixed across card movement and rerenders.
export function BadgeEmblem({{ tier, earned = true, variant = 'rank' }}: {{ tier: number; earned?: boolean; variant?: 'rank' | 'challenge' }}) {{
  const badges = variant === 'challenge' ? CHALLENGE_BADGES : RANK_BADGES;
  const index = Math.max(0, Math.min(badges.length - 1, tier));
  return <span className={{`badge-emblem ${{earned ? '' : 'badge-locked'}}`}} aria-hidden="true">
    <img className="badge-art" src={{`${{import.meta.env.BASE_URL}}badges/${{badges[index]}}.svg`}} alt="" draggable={{false}} />
  </span>;
}}
''')
