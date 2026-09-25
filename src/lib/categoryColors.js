// Assigns each category a consistent soft pill color, without needing to
// hardcode every possible category name. Same category always gets the
// same color (hashed from its name), works with default categories or
// ones added later via categorySeed.js / user-created categories.

const PALETTE = [
  { bg: 'bg-[#F3E3E1]', text: 'text-[#8A3B34]', bgDark: 'dark:bg-[#3A2422]', textDark: 'dark:text-[#E3A79D]' }, // rose
  { bg: 'bg-[#F2E7D2]', text: 'text-[#8A5A1F]', bgDark: 'dark:bg-[#3A2E1C]', textDark: 'dark:text-[#E0B778]' }, // amber
  { bg: 'bg-[#E3E8D6]', text: 'text-[#4E6B2E]', bgDark: 'dark:bg-[#26301E]', textDark: 'dark:text-[#A9C98A]' }, // olive
  { bg: 'bg-[#D9E7E5]', text: 'text-[#2E6B63]', bgDark: 'dark:bg-[#1C302C]', textDark: 'dark:text-[#8ACABE]' }, // teal
  { bg: 'bg-[#E1E3F2]', text: 'text-[#3C3F8A]', bgDark: 'dark:bg-[#22243A]', textDark: 'dark:text-[#A6ABE0]' }, // indigo
  { bg: 'bg-[#EDE1F0]', text: 'text-[#7A3B8A]', bgDark: 'dark:bg-[#332038]', textDark: 'dark:text-[#CB9AD6]' }, // plum
]

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function categoryPillClasses(categoryName) {
  const c = PALETTE[hashString(categoryName || 'default') % PALETTE.length]
  return `${c.bg} ${c.text} ${c.bgDark} ${c.textDark}`
}
