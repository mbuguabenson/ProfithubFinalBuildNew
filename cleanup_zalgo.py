import os

path = r'c:\Users\Castel Technologies\Videos\ProfithubApril21\profithubapril-master\src\pages\smart-trading\components\signal-centre-tab.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all mojibake/corrupted strings
replacements = {
    'âš–ï¸ ': '⚖️',
    'ðŸ“Š': '📊',
    'ðŸŽ¯': '🎯',
    'ðŸ“ˆ': '📈',
    'ðŸ¤–': '🤖',
    'ðŸ”„': '🔄',
    'âš ï¸ ': '⚠️',
    'ðŸ“¤': '📤',
    'âœ…': '✅',
    'ðŸ   ': '🏆',
    'â Œ': '❌',
    'ðŸ“‰': '📉',
    'ðŸ›‘': '🛑',
    'ðŸ“¡': '📡',
    'ðŸ” ': '🔍',
    'â›”': '⛔',
    'ðŸš€': '🚀',
    'ðŸ” ': '🔍',
    'â ¹': '⏹',
    'ðŸš€': '🚀',
    'â• ': '═',
    'â— ': '●',
    'â€¦': '...',
    'Â·': '·',
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Also fix some specific strings that might have been double corrupted
content = content.replace('â ¹ Bot stopped', '⏹ Bot stopped')
content = content.replace('ðŸ”  Scan First', '🔍 Scan First')
content = content.replace('ðŸš€ START BOT', '🚀 START BOT')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
