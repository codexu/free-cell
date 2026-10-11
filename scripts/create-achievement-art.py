from pathlib import Path
import json
from html import escape

out = Path(__file__).resolve().parent.parent / 'public/achievements'
out.mkdir(parents=True, exist_ok=True)
# Each central illustration is authored here, without third-party icon paths.
items = [
('first-joy','第一份喜悦','起步','首次通关',100,'<path d="M36 58h56v39H36Z" fill="#d97078"/><path d="M32 49h64v14H32Z" fill="#eaa08e"/><path d="M59 49h10v48H59Z"/><path d="M64 48C30 44 42 21 56 34Zm0 0c34-4 22-27 8-14Z" fill="#9dcbb5"/><path d="M26 35v10m-5-5h10m65-5 4-7m-1 49 7 3" fill="none"/>'),
('steady-boat','渐入佳境','起步','累计通关 10 个不同编号',200,'<path d="M30 79h68L84 96H44Z" fill="#dba776"/><path d="M64 28v51M58 34 35 70h23Zm12 6 22 30H70Z" fill="#9dccbc"/><path d="M26 102c9-7 18 7 27 0s18 7 27 0 18 7 27 0" fill="none" stroke="#8ccacb" stroke-width="3"/>'),
('hundred-library','百局有成','起步','累计通关 100 个不同编号',500,'<path d="M28 35h72v64H28Z" fill="#557b75"/><path d="M31 59h66M31 80h66" fill="none"/><path d="M35 40h9v16h-9Zm14 0h11v16H49Zm16 0h7v16h-7Zm12 0h12v16H77ZM36 63h12v14H36Zm18 0h8v14h-8Zm13 0h7v14h-7Zm10 0h13v14H77Z"/><path d="m37 95 10-10 9 10m13 0 10-10 10 10" fill="none"/>'),
('thousand-fireworks','千局传奇','起步','累计通关 1,000 个不同编号',2000,'<path d="M64 40v42m-25-27 25 27 25-27M33 79l31 3 31-3" fill="none" stroke="#e3aa7f" stroke-width="3"/><path d="m64 25 3 7-3 7-3-7Zm-28 12 6 6-1 8-7-5Zm56 0-6 6 1 8 7-5Z" fill="#a7ddd1"/><circle cx="28" cy="68" r="4"/><circle cx="100" cy="68" r="4"/><path d="m64 72 6 12 14 2-10 9 2 13-12-6-12 6 2-13-10-9 14-2Z" fill="#dc9976"/>'),
('three-minute','三分钟好手','速度','首次在 3 分钟内通关',100,'<path d="M35 84h58l7 14H28Z" fill="#83bac7"/><ellipse cx="64" cy="76" rx="28" ry="10"/><path d="M64 75V35l14 40Z" fill="#efba73"/><path d="M46 75h4m25 6 3 3m-16-1v5m-21-8-4 4M28 37v12m-6-6h12" fill="none"/><circle cx="28" cy="43" r="10" fill="none"/>'),
('two-minute','两分钟高手','速度','首次在 2 分钟内通关',200,'<circle cx="64" cy="69" r="30" fill="#7badba"/><circle cx="64" cy="69" r="23" fill="#254850"/><path d="M55 28h18v8H55ZM60 37v-4M84 45l8-8M64 49v20l14-8" fill="none" stroke-width="4"/><path d="M44 69h3m17 18v3m17-21h3" fill="none"/><circle cx="64" cy="69" r="3"/>'),
('one-minute','分秒必争','速度','首次在 1 分钟内通关',500,'<path d="m69 24-30 43h22l-7 35 35-51H66Z" fill="#f4ce7b"/><path d="M29 40h17M23 53h16M88 81h16M85 95h13" fill="none" stroke="#9acbd0" stroke-width="3"/>'),
('fast-and-steady','快而稳','速度','10 个不同编号在 2 分钟内通关',500,'<path d="M48 46 24 33c0 16 8 31 24 32m32-19 24-13c0 16-8 31-24 32" fill="#9cc9d2"/><path d="M49 37h30M49 97h30M53 40c0 13 4 17 11 23-7 5-11 10-11 31h22c0-21-4-26-11-31 7-6 11-10 11-23Z"/><path d="m58 47 6 11 6-11ZM57 90l7-16 7 16Z" fill="#84b9c6" stroke="none"/>'),
('easy-clearing','小试身手','难度','首次通关简单难度',50,'<path d="M25 90c11-36 34-49 50-30 11 12 22 17 28 30Z" fill="#8bc4a8"/><path d="M42 85 61 73l13 12" fill="none"/><circle cx="89" cy="37" r="12"/><path d="M30 66V39m0 0h23l-7 8 7 8H30" fill="#e5a57b"/>'),
('medium-pass','从容应对','难度','首次通关中等难度',100,'<path d="m23 95 31-57 25 44 15-29 16 42Z" fill="#79b2a6"/><path d="m43 59 11-21 12 21-12-5Z" fill="#f6ead0"/><path d="M35 91 64 78 55 69 77 60" fill="none" stroke-width="3"/><path d="M77 60V30m0 0h18l-5 7 5 7H77" fill="#dfac73"/>'),
('hard-peak','迎难而上','难度','首次通关困难难度',200,'<path d="m22 98 25-40 10 16 20-48 29 72Z" fill="#749eaa"/><path d="m66 52 11-26 14 26-14-6Z" fill="#e7f0de"/><path d="m41 99 11-12 18 6 13-12-8-12" fill="none" stroke-width="3"/><path d="M77 27V17h17l-7 5 7 5Z" fill="#e6a969"/>'),
('expert-expedition','专家之路','难度','首次通关专家难度',500,'<path d="m21 99 27-43 13 19 20-32 26 56Z" fill="#9daac1"/><path d="m38 72 10-16 12 18-12-5Zm33-13 10-16 10 16-10-5Z" fill="#f5eacf"/><path d="M64 35v17M60 59l-8 37h10l5-23 8 23h10L73 57Z" fill="#e9b26f"/><circle cx="67" cy="48" r="7"/><path d="m73 58 14-7 7-20M58 58l-13 11M96 29l-5 2" fill="none" stroke-width="3"/>'),
('lighthouse','独立解局','技巧','不使用提示通关',200,'<path d="m48 96 8-51h16l8 51Z" fill="#e7d5ab"/><path d="M53 72h23v11H51Z" fill="#db9478"/><path d="M53 45V32h22v13ZM49 31l15-10 15 10Z"/><path d="m52 36-25-8m25 14-27 9m51-15 26-8m-26 14 27 9" fill="none" stroke="#a4d9ca" stroke-width="2.5"/><path d="M36 99h56"/>'),
('forward-arrow','一往直前','技巧','不使用撤销通关',200,'<path d="M29 57h43V40l30 29-30 29V80H29Z" fill="#98c7ad"/><path d="m28 48 27-19 13 9-23 16" fill="none"/><path d="M25 91h19m-20-8h10" fill="none"/>'),
('strategy-knight','胸有成竹','技巧','不使用提示和撤销通关',500,'<path d="M36 94h56l-6-11H42ZM43 80c0-14 4-19 14-29l-13 4-10-10 22-14 3-13 16 14c19 11 19 28 10 48Z" fill="#dbc69b"/><path d="m51 41 8-4m14 9c9 12 4 19-1 26" fill="none" stroke="#586d76" stroke-width="3"/><path d="M38 100h51"/>'),
('wise-dragon','真正的高手','技巧','专家难度下不使用提示和撤销通关',1000,'<path d="M44 86c-21-9-21-36-3-49l-5-13 17 11 17-13-3 19 17 4-5 12 15 8-8 14-20-2 12-9-15-11c-15 0-21 22-9 28 10 4 20-2 18-12 21 21-5 32-26 13Z" fill="#9abac4"/><path d="m42 53-12-6 6 17M80 77l9 16-13-4" fill="#e3b273"/><circle cx="61" cy="45" r="3" fill="#fce3a6" stroke="none"/><path d="M35 91c-7 11-9 7-10 3" fill="none"/>'),
('paired-doves','好事成双','连胜','连续通关 2 个不同编号',100,'<path d="M62 73C35 78 24 59 32 44l19 13 11 16Zm4 0c27 5 38-14 30-29L77 57 66 73Z" fill="#eed3ab"/><path d="m49 60 4-22 9 21m17 1-4-22-9 21" fill="#bcb3d2"/><path d="m52 86 12-9 12 9M44 85l8 1m32-1-8 1" fill="none"/>'),
('victory-banner','势如破竹','连胜','连续通关 5 个不同编号',300,'<path d="M36 104V27m0 0h57l-9 21 9 22H36Z" fill="#ba8798"/><path d="m64 34 5 9 10 2-7 7 1 10-9-5-9 5 1-10-7-7 10-2Z"/><path d="m46 86 8-4 8 4m13-5 6 4 7-5" fill="none"/>'),
('victory-blaze','十全十美','连胜','连续通关 10 个不同编号',800,'<path d="M48 100C14 89 35 67 39 51l12 14c-3-17 4-32 16-44-2 22 25 31 29 49 7 26-23 38-48 30Z" fill="#e19579"/><path d="M62 101c-22-7-23-21-11-37l9 12 10-27c19 24 17 43-8 52Z" fill="#f4d495"/><path d="m32 37-8-8m69 18 10-7" fill="none"/>'),
('ever-victorious','常胜牌手','连胜','连续通关 20 个不同编号',1500,'<path d="M28 47c0-21 29-21 36 0 7-21 36-21 36 0s-29 21-36 0c-7 21-36 21-36 0Z" fill="none" stroke="#eace96" stroke-width="7"/><path d="m45 73 19-8 19 8v12c0 11-10 16-19 20-9-4-19-9-19-20Z" fill="#b69dcb"/><path d="m54 84 7 7 14-16" fill="none" stroke-width="4"/>'),
('today-done','今日已完成','每日挑战','首次完成每日挑战',100,'<path d="M35 41h58v57H35Z" fill="#e8cf9b"/><path d="M35 41h58v15H35Z" fill="#8caca9"/><path d="M48 34v13m32-13v13m-30 30 10 10 21-23" fill="none" stroke="#315e59" stroke-width="4"/><circle cx="91" cy="31" r="10" fill="#f0cc83"/><path d="M91 15v-5m15 20h5" fill="none"/>'),
('seven-day-bridge','一周之约','每日挑战','连续 7 天完成当天挑战',300,'<path d="M24 82V60c20-14 60-14 80 0v22H91c-10-23-44-23-54 0Z" fill="#95bbb3"/><path d="M25 52v12m13-17v11m13-14v10m13-11v10m13-9v10m13-7v11m13-6v12" fill="none" stroke-width="3"/><path d="M24 97c10-6 20 6 30 0s20 6 30 0 13 3 20 0" fill="none" stroke="#94d1cb"/><path d="M64 33V19h15l-6 7 6 7Z" fill="#e1ac78"/>'),
('month-garden','一月相伴','每日挑战','一个自然月完成 20 天挑战',500,'<path d="M34 89h60l-8 17H42Z" fill="#c39677"/><path d="M46 89V60m18 29V43m18 46V60" fill="none" stroke="#a6c9a7" stroke-width="3"/><path d="M44 76c-16 0-17-11-15-14 13 0 17 6 15 14Zm37 0c16 0 17-11 15-14-13 0-17 6-15 14Z" fill="#91bea3"/><circle cx="44" cy="54" r="10" fill="#c993a7"/><circle cx="83" cy="54" r="10" fill="#e4b185"/><path d="m64 25 5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1Z" fill="#f1d48d"/>'),
('perfect-month','一天不落','每日挑战','完成一个自然月全部挑战',1000,'<circle cx="64" cy="52" r="27" fill="#c4b4df"/><path d="M51 33c-18 11-11 35 9 38-24 6-36-27-9-38Z" fill="#faf0c4"/><path d="m80 33 3 7 7 2-6 5 1 8-7-4-6 4 1-8-6-5 8-2Z"/><path d="M36 78h56v26H36Z" fill="#dfc692"/><path d="M36 84h56M48 74v9m32-9v9m-25 13 7 5 13-12" fill="none" stroke="#78618e" stroke-width="3"/>'),
]
# Final reviewed catalogue: keep distinct artwork, discard the easy draft entries.
artwork={item[0]:item[5] for item in items}
artwork.update({
'collector-vault':'<path d="M29 37h70v65H29Z" fill="#91b8ac"/><circle cx="64" cy="70" r="20"/><circle cx="64" cy="70" r="9" fill="#355b53"/><path d="M64 61v18m-9-9h18M35 44h58M31 84h8m50 0h8" fill="none"/>',
'four-directions':'<path d="m64 22 13 21 23 21-23 21-13 21-13-21-23-21 23-21Z" fill="#afcdb6"/><circle cx="64" cy="64" r="16"/><path d="m64 52 8 12-8 12-8-12Z" fill="#526c6b"/>',
'calm-wings':'<path d="M59 92C27 86 23 56 30 31l26 34M69 92c32-6 36-36 29-61L72 65" fill="#b9d4cc"/><path d="M58 90V44h12v46M36 52l19 19m37-19L73 71" fill="none"/><circle cx="64" cy="34" r="10"/>',
'empty-courtyard':'<path d="M29 102V43h70v59H85V61c0-22-42-22-42 0v41Z" fill="#bfc9b1"/><path d="M29 41h70M36 30h56M44 91h40M50 99h28" fill="none"/><path d="M64 64v19m-6-13h12" stroke="#82af94"/>',
'two-lanterns':'<path d="M35 34h58M42 34v14m44-14v14M30 50h24v31H30Zm44 0h24v31H74Z" fill="#a8caad"/><path d="M42 82v11m44-11v11M36 92h12m32 0h12M36 57h12m-6 0v18m38-18h12m-6 0v18" fill="none"/>',
'balanced-scales':'<path d="M64 28v65M40 102h48M33 47h62M39 47 24 77h30L39 47Zm50 0L74 77h30L89 47Z" fill="#aac2ce"/><path d="M24 77c2 17 28 17 30 0m20 0c2 17 28 17 30 0" fill="#e1bc82"/>',
'recovery-lotus':'<path d="M64 98C29 94 21 74 29 59l23 20M64 98c35-4 43-24 35-39L76 79M64 98C39 77 45 51 64 36c19 15 25 41 0 62Z" fill="#b5cfb2"/><path d="M64 86V50M26 101h76" fill="none"/><path d="M51 27h26m-22-8h18"/>',
'composed-pavilion':'<path d="M34 97V53m60 0v44M26 100h76M29 54h70L64 31Z" fill="#c9d2b8"/><path d="M45 63h38v30H45ZM48 36V25h32v11" fill="#92b7ab"/><path d="M57 70h14m-7 0v17" fill="none"/>',
'long-train':'<path d="M27 69h24v26H27Zm24-14h30v40H51Zm30 14h22v26H81Z" fill="#96bac7"/><path d="M56 49h20v8H56M59 61h14v16H59M27 100h76"/><circle cx="38" cy="96" r="6"/><circle cx="68" cy="96" r="6"/><circle cx="91" cy="96" r="6"/><path d="M64 38c-12-9 0-17 10-9m-1 0c8 5 14-2 10-9" fill="none"/>',
'complete-dragon':'<path d="M30 86c-12-32 28-59 48-42 13 12-3 32-20 24-20-9-16 21 2 25 17 5 34-7 29-25l12-14 7 21-10-3c3 32-45 46-68 14Z" fill="#9fc9bf"/><path d="m71 44 9-15 4 18 14 2-12 12-10-4M35 73l-10-6m23-16-5-10m15 53 1 10"/><circle cx="81" cy="49" r="3" fill="#355a55" stroke="none"/>',
'grand-migration':'<path d="M27 70h70v27H27Z" fill="#99b7b7"/><path d="M34 69V49h56v20M40 48V33h43v15" fill="#d7c69f"/><path d="M27 81h70M34 56h48M61 33V20m-7 6 7-6 7 6" fill="none"/><circle cx="41" cy="99" r="6"/><circle cx="84" cy="99" r="6"/>',
'returning-koi':'<path d="M85 38C53 14 17 51 36 80c10 17 38 18 46 4M84 38l-1-13m1 13-14-1" fill="none" stroke-width="3"/><path d="M44 56c26-20 48-8 38 11L95 85l-23-9C56 90 39 81 44 56Z" fill="#dcad7e"/><circle cx="51" cy="60" r="3" fill="#48656a" stroke="none"/><path d="m66 58 9 9-10 6" fill="none"/>',
'handcrafted-finish':'<path d="M26 88V72l20-13 13-31c3-6 10-2 8 4l-6 25 17-11c6-4 12 2 7 7l-17 14 22-9c7-3 10 4 4 8L74 79l23-4c7-1 8 7 1 9l-34 13H37Z" fill="#d7b08b"/><path d="M27 86h15v14H27Z" fill="#7ca4a3"/>',
'eighty-steps':'<path d="M25 97h22V80h20V62h19V43h18v54Z" fill="#a9c0b3"/><path d="m34 61 24-16 26-16m-13 0h13v13" fill="none" stroke-width="3"/><circle cx="35" cy="35" r="8"/>',
'sixty-five-steps':'<path d="M39 96c-19-13-20-37-8-52 16-3 33 4 33 4s17-7 33-4c12 15 11 39-8 52Z" fill="#9ab8c3"/><path d="m64 48-5 20 5 10 5-10Zm-25 6 17 5m16 0 17-5M47 88h34" fill="none"/><path d="M42 40V27h44v13"/>',
'independent-captain':'<path d="M34 53c0-41 60-41 60 0v34l-15 14H49L34 87Z" fill="#acb7cd"/><path d="M34 55h60M46 65h11m14 0h11M55 83h18M55 53V38h18v15" fill="none"/><path d="m62 18 3-8 7 11"/>',
'expert-resident':'<path d="M27 100V53l37-25 37 25v47Z" fill="#adb8cd"/><path d="M49 100V65h30v35M32 54h64M59 74h10v16H59"/><path d="M48 44h32m-16-8v15" fill="none"/>',
'expert-hundred':'<path d="M28 100V43h18v57M82 100V43h18v57M27 43h20m34 0h20M43 100V62c0-27 42-27 42 0v38Z" fill="#bdc6da"/><path d="m57 71 7-9 7 9-7 14Z" fill="#a994c1"/><path d="M25 105h78"/>',
'expert-chain':'<path d="m28 73 21-21 12 12-21 21Z" fill="#aeafce"/><path d="m67 47 21-21 12 12-21 21Z" fill="#e5cb91"/><path d="m49 67 31-31M63 80l6 11 12 2-9 8 2 12-11-6-11 6 2-12-9-8 12-2Z" fill="none" stroke-width="4"/>',
'personal-dawn':'<path d="M25 86h78M38 81a26 26 0 0 1 52 0" fill="#e6bc83"/><path d="M64 49V35m-26 23-9-9m60 9 10-9M34 95h58M43 104h40" fill="none" stroke="#adccc9" stroke-width="3"/>',
'fewer-moves':'<path d="M27 84 49 44l20 27 23-44" fill="none" stroke="#afd5bb" stroke-width="6"/><path d="m80 27 12 0 1 13" fill="none" stroke-width="3"/><path d="M36 103h56M44 94h40M53 85h22"/>',
'double-breakthrough':'<path d="M33 51c-19 7-14 31 7 27h21V57Zm62 0c19 7 14 31-7 27H67V57Z" fill="#d0b5d8"/><path d="m64 30 9 12-9 13-9-13Zm0 45 9 12-9 13-9-13Z"/><path d="m48 37-10-8m42 8 10-8" fill="none"/>',
'breakthrough-ten':'<path d="M31 103V72h20V55h20V37h25v66Z" fill="#a5c3c5"/><path d="m63 24 6 11 12 2-9 8 2 12-11-6-11 6 2-12-9-8 12-2Z"/><path d="M39 83h5m15-16h5m15-16h7" fill="none"/>',
'daily-thirty':'<path d="M35 101V57l29-22 29 22v44Z" fill="#b2bfd3"/><circle cx="64" cy="66" r="14"/><path d="M64 56v11l8 4M59 100V88h10v12M31 58h66M64 34V23h14l-5 6 5 5Z"/>',
'four-seasons':'<path d="M64 91V35m0 40-21-17m21 9 20-17" fill="none" stroke="#d4b386" stroke-width="5"/><path d="M43 59c-17 5-22-12-15-23 13 1 21 9 15 23Z" fill="#b0ccaa"/><circle cx="84" cy="41" r="12" fill="#e7bf79"/><path d="m36 77 9-10 10 10-10 15Z" fill="#d9a47b"/><path d="M85 73v20m-9-16 18 12m0-12-18 12" fill="none" stroke="#b9cee4"/><path d="M43 104h42"/>',
'daily-year':'<ellipse cx="64" cy="63" rx="30" ry="35" fill="#a7bed2"/><ellipse cx="64" cy="63" rx="13" ry="35" fill="none"/><path d="M35 63h58M40 45h48M40 81h48M64 28v70" fill="none"/><path d="m87 25 4 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1Z"/>',
})
# id, name, category, condition, XP, artwork source, target, hidden
catalogue=[
('hundred-library','百局有成','长期积累','通关 100 个不同编号',500,'hundred-library',100,False),
('collector-vault','解局收藏家','长期积累','通关 500 个不同编号',1500,'collector-vault',500,False),
('thousand-fireworks','千局传奇','长期积累','通关 1,000 个不同编号',3000,'thousand-fireworks',1000,False),
('four-directions','全面发展','长期积累','四种难度各通关 25 个不同编号',1000,'four-directions',100,False),
('one-minute','分秒必争','速度','1 分钟内通关',500,'one-minute',1,False),
('fast-and-steady','快而稳','速度','20 个不同编号在 2 分钟内通关',600,'fast-and-steady',20,False),
('calm-wings','稳中求快','速度','无提示、无撤销，2 分钟内通关',600,'calm-wings',1,False),
('expert-expedition','专家风范','速度','专家局无提示、无撤销，3 分钟内通关',1000,'expert-expedition',1,False),
('empty-courtyard','四格从容','空间管理','全程不使用中转格通关',600,'empty-courtyard',1,False),
('two-lanterns','留有余地','空间管理','困难局全程最多占用两个中转格并通关',500,'two-lanterns',1,False),
('balanced-scales','运筹帷幄','空间管理','专家局全程最多占用两个中转格并通关',1000,'balanced-scales',1,False),
('recovery-lotus','绝处逢生','空间管理','四格全满且无空列的局面之后通关',500,'recovery-lotus',1,True),
('composed-pavilion','游刃有余','空间管理','10 个不同编号全程最多占用两个中转格并通关',700,'composed-pavilion',10,False),
('long-train','长龙初现','整理与操作','整理八张连续有序牌后通关',300,'long-train',1,False),
('complete-dragon','一气贯通','整理与操作','整理出 K 到 A 完整有序牌组后通关',1000,'complete-dragon',1,True),
('grand-migration','大举迁移','整理与操作','一次移动至少八张牌后通关',800,'grand-migration',1,True),
('returning-koi','收放自如','整理与操作','从收牌区取回牌后通关',300,'returning-koi',1,False),
('handcrafted-finish','自己收尾','整理与操作','关闭自动收牌、不使用收牌按钮通关',500,'handcrafted-finish',1,False),
('strategy-knight','胸有成竹','解局能力','无提示、无撤销通关',500,'strategy-knight',1,False),
('wise-dragon','真正的高手','解局能力','专家局无提示、无撤销通关',1000,'wise-dragon',1,False),
('eighty-steps','精打细算','解局能力','80 次操作内通关',400,'eighty-steps',1,False),
('sixty-five-steps','步步有数','解局能力','65 次操作内通关',800,'sixty-five-steps',1,False),
('independent-captain','独当一面','解局能力','20 个不同编号无提示、无撤销通关',1000,'independent-captain',20,False),
('expert-resident','专家常客','专家与连胜','通关 25 个不同专家编号',1000,'expert-resident',25,False),
('expert-hundred','专家百战','专家与连胜','通关 100 个不同专家编号',2000,'expert-hundred',100,False),
('victory-blaze','十全十美','专家与连胜','连续通关 10 个不同编号',800,'victory-blaze',10,False),
('ever-victorious','常胜牌手','专家与连胜','连续通关 20 个不同编号',1500,'ever-victorious',20,False),
('expert-chain','专家连捷','专家与连胜','连续通关五个不同专家编号',1200,'expert-chain',5,False),
('personal-dawn','再进一步','自我突破','重玩将个人最佳用时缩短至少 20%',300,'personal-dawn',1,False),
('fewer-moves','更少一步','自我突破','重玩将个人最佳步数减少至少十步',300,'fewer-moves',1,False),
('double-breakthrough','双重突破','自我突破','同一局同时刷新编号最佳用时和步数',600,'double-breakthrough',1,True),
('breakthrough-ten','十次突破','自我突破','十个不同编号刷新个人最佳用时',800,'breakthrough-ten',10,False),
('daily-thirty','三十日之约','每日挑战','连续 30 天完成当天挑战',1000,'daily-thirty',30,False),
('perfect-month','一天不落','每日挑战','完成一个自然月全部挑战',1000,'perfect-month',1,False),
('four-seasons','四季相伴','每日挑战','完成四个自然月全部挑战',2000,'four-seasons',4,False),
('daily-year','挑战全年','每日挑战','完成 365 个不同日期的每日挑战',3000,'daily-year',365,False),
]
items=[(slug,title,category,condition,xp,artwork[source]) for slug,title,category,condition,xp,source,target,hidden in catalogue]
colors = {'长期积累':('#45876b','#204f43','#94ccb0'), '速度':('#3f8192','#214552','#94cbdc'), '空间管理':('#547d6d','#2b4840','#a9cfa3'), '整理与操作':('#826d50','#483d30','#ddc795'), '解局能力':('#537596','#293c56','#b0c6dd'), '专家与连胜':('#915469','#4b2c46','#e2a6b7'), '自我突破':('#588484','#284a49','#b1d9d1'), '每日挑战':('#777399','#3a3657','#c2b5e0')}

for asset in out.glob('*.svg'):
    if asset.stem not in {item[0] for item in items}:
        asset.unlink()
manifest=[]
for slug,title,category,condition,xp,art in items:
    light,dark,accent=colors[category]
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img"><title>{escape(title)}</title><defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff2c8"/><stop offset=".35" stop-color="#c49a55"/><stop offset=".6" stop-color="#ffe4a2"/><stop offset="1" stop-color="#916932"/></linearGradient><radialGradient id="enamel" cx=".3" cy=".2" r=".85"><stop stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></radialGradient><linearGradient id="gold" x2=".4" y2="1"><stop stop-color="#ffedb7"/><stop offset="1" stop-color="#c79751"/></linearGradient></defs><rect x="7" y="9" width="114" height="114" rx="25" fill="#102923" opacity=".25"/><rect x="7" y="5" width="114" height="114" rx="25" fill="url(#metal)"/><rect x="12" y="10" width="104" height="104" rx="21" fill="url(#enamel)" stroke="#816439" stroke-width="1.5"/><rect x="17" y="15" width="94" height="94" rx="17" fill="none" stroke="{accent}" stroke-opacity=".5"/><path d="M21 43V33c0-7 5-12 12-12h10" fill="none" stroke="#fff7da" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/><g fill="url(#gold)" stroke="#eed094" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" transform="translate(6 2) scale(.9)">{art}</g><path d="m64 8 4 4-4 4-4-4Zm0 99 4 4-4 4-4-4Z" fill="{accent}" stroke="#eace96" stroke-width=".7"/></svg>'''
    (out/f'{slug}.svg').write_text(svg)
    row=next(row for row in catalogue if row[0]==slug)
    manifest.append(dict(id=slug,name=title,category=category,condition=condition,xp=xp,art=f'{slug}.svg',target=row[6],hidden=row[7]))
catalogue_json=json.dumps(manifest,ensure_ascii=False,indent=2)+'\n'
(out/'manifest.json').write_text(catalogue_json)
(out.parent.parent/'src/achievementCatalogue.json').write_text(catalogue_json)
(out/'README.md').write_text('''# 成就插画设计稿\n\n36 项原创 SVG 插画，与已确认的成就草案一一对应。\n按长期积累、速度、空间管理、整理与操作、解局能力、专家与连胜、自我突破、每日挑战分八类。\n采用圆角珐琅铭牌，主体插画不复用等级徽章，也不依赖外部图标或字体。\n生成器同步输出 manifest.json 和 src/achievementCatalogue.json，判定逻辑位于 src/achievements.ts。\n重新生成：python3 scripts/create-achievement-art.py\n''')
cards=''.join(f'<article data-category="{category}"><img src="{slug}.svg" alt="{title}"/><div><small>{category}</small><h2>{title}</h2><p>{condition}</p><b>+{xp:,} XP</b></div></article>' for slug,title,category,condition,xp,_ in items)
buttons=''.join(f'<button data-filter="{category}" aria-pressed="false">{category}</button>' for category in colors)
(out/'gallery.html').write_text('''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>空当接龙 · 成就插画设计</title><style>*{box-sizing:border-box}body{margin:0;padding:32px;background:#163c32;color:#f7ecd1;font-family:system-ui,sans-serif}header,main,nav{max-width:1120px;margin:auto}header>small{font-size:10px;letter-spacing:3px;color:#d0b677}h1{font-size:28px;margin:12px 0}header p{font-size:13px;line-height:1.8;color:#b7cbb7}nav{display:flex;flex-wrap:wrap;gap:8px;padding:20px 0}button{border:1px solid #d0b67750;border-radius:20px;padding:8px 14px;background:#ffffff08;color:#dbe3cc;cursor:pointer}button[aria-pressed=true]{background:#dbc084;color:#244c3b}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}article{display:flex;align-items:center;gap:12px;padding:16px 10px;background:linear-gradient(130deg,#ffffff09,#ffffff03);border:1px solid #d0b67730;border-radius:17px}article[hidden]{display:none}img{width:100px;height:100px;flex-shrink:0}h2{font-size:15px;margin:7px 0}article small{font-size:10px;color:#b9c9b0}article p{font-size:11px;color:#b7cbb7;line-height:1.6;min-height:35px;margin:0 0 8px}article b{font-size:11px;color:#dec589}a{color:#dec589}footer{max-width:1120px;margin:28px auto;font-size:11px;line-height:1.9;color:#a7bfa7}@media(max-width:500px){body{padding:20px}img{width:90px;height:90px}}</style></head><body><header><small>FREECELL · ACHIEVEMENTS</small><h1>每一次突破，都值得收藏</h1><p>36 项成就 · 36 张原创 SVG 插画 · 八个系列<br>这是插画预览，36 项最终成就设计，四项隐藏成就在本预览中完整展示。</p></header><nav><button data-filter="全部" aria-pressed="true">全部 36 项</button>'''+buttons+'''</nav><main>'''+cards+'''</main><footer>累计、速度、技巧和连胜按不同牌局编号计数，成就奖励仅领取一次。速度成就可同时解锁，成就 XP 不参与首胜或速度加成。<br>每日连续挑战要求完成当天挑战；月度成就允许补玩。<br><a href="../badges/gallery.html">查看等级徽章 →</a></footer><script>document.querySelectorAll('button[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelectorAll('article').forEach(item=>item.hidden=button.dataset.filter!=='全部'&&item.dataset.category!==button.dataset.filter)}));</script></body></html>''')
