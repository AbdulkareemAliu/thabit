# Extracted Arabic Vocabulary

Extracted from `/Applications/Work/Courses/Arabic/andalus_arabic_textbook.pdf`.

Only detected lesson vocabulary tables were exported: nouns, verbs, and phrases.

## CSV schemas

- `nouns.csv`: `arabic,arabic_image,english`
- `phrases.csv`: `arabic,arabic_image,english`
- `verbs.csv`: Arabic form columns plus matching `*_arabic_image` columns for each form. Optional `harf_arabic` column for the preposition/particle (الحرف) that accompanies the verb, e.g. `مَعَ` or `إِلَى`. Run `python scripts/populate-verb-harf.py` to fill `harf_arabic` from the source PDF.

Note: the PDF provides a single English gloss for most verbs, so that extracted gloss is reused across the tense/form English columns rather than inventing translations.

## Counts

- 01_Greetings: 28 nouns, 0 verbs, 15 phrases
- 02_Introductions: 11 nouns, 2 verbs, 0 phrases
- 03_Family: 66 nouns, 5 verbs, 4 phrases
- 04_Housing: 52 nouns, 8 verbs, 8 phrases
- 05_Introducing_Oneself: 46 nouns, 15 verbs, 7 phrases
- 06_My_Day: 38 nouns, 12 verbs, 8 phrases
- 07_At_the_Restaurant: 41 nouns, 9 verbs, 6 phrases
- 08_Travel: 24 nouns, 20 verbs, 5 phrases
- 09_My_Favorite_Friend: 34 nouns, 21 verbs, 9 phrases
- 10_Going_to_the_Market: 43 nouns, 9 verbs, 7 phrases
- 11_Hospital_Visit: 57 nouns, 17 verbs, 5 phrases
- 12_My_Day_at_School: 48 nouns, 16 verbs, 6 phrases
- 13_Rest_at_Home: 70 nouns, 20 verbs, 9 phrases
- 14_Late_for_Work: 48 nouns, 14 verbs, 12 phrases
- 15_Weather: 46 nouns, 8 verbs, 16 phrases
- 16_Job_Interview: 49 nouns, 19 verbs, 14 phrases
- 17_Getting_to_Know_My_Neighbors: 45 nouns, 12 verbs, 12 phrases
- 18_Receiving_Guests: 28 nouns, 16 verbs, 5 phrases
- 19_Nursery_Registration: 20 nouns, 14 verbs, 10 phrases
- 20_Football_Match: 45 nouns, 22 verbs, 5 phrases
- 21_At_the_Post_Office: 41 nouns, 14 verbs, 8 phrases
- 22_The_New_House: 34 nouns, 11 verbs, 6 phrases
- 23_Online_Job_Search: 27 nouns, 12 verbs, 5 phrases
- 24_Distance_Lessons: 34 nouns, 16 verbs, 13 phrases
- 25_Food_Allergies: 32 nouns, 12 verbs, 6 phrases
- 26_Cosmic_Disasters: 51 nouns, 14 verbs, 9 phrases
- 27_Life_in_the_City_of_the_Prophet: 46 nouns, 17 verbs, 7 phrases
- 28_A_Joyful_Day_With_Sisters: 39 nouns, 10 verbs, 2 phrases
- 29_Changes_in_the_Education_System: 49 nouns, 18 verbs, 4 phrases
- 30_Hospitality_in_Morocco: 23 nouns, 14 verbs, 4 phrases
- 31_Wudu: 41 nouns, 10 verbs, 6 phrases
- 32_Clothing_of_the_Muslim_Woman: 43 nouns, 7 verbs, 5 phrases
- 33_Etiquette_of_the_Student_of_Knowledge: 28 nouns, 15 verbs, 3 phrases
- 34_Balancing_Work_and_Seeking_Knowledge: 26 nouns, 13 verbs, 4 phrases
- 35_Marriage_in_Islam: 32 nouns, 11 verbs, 4 phrases
- 36_Eloquence_Among_the_Arabs: 48 nouns, 12 verbs, 5 phrases
- 37_Raising_Children_in_Islam: 15 nouns, 18 verbs, 7 phrases
- 38_Exercise_Strengthens_the_Mind: 18 nouns, 7 verbs, 3 phrases
- 39_Hijrah: 34 nouns, 19 verbs, 6 phrases
- 40_Social_Media_Addiction: 36 nouns, 10 verbs, 5 phrases
- 41_Gathering_One_Purpose: 12 nouns, 13 verbs, 9 phrases
- 42_Rest_for_Renewed_Energy: 27 nouns, 15 verbs, 1 phrases
- 43_Success_and_the_Ultimate_Goal: 16 nouns, 11 verbs, 3 phrases
- 44_Managing_Priorities: 30 nouns, 22 verbs, 4 phrases
- 45_Paradise_and_Worship: 20 nouns, 15 verbs, 5 phrases
- 46_Benefits_of_AI_for_Students: 26 nouns, 7 verbs, 2 phrases
- 47_Dialogue_in_the_Prophets_Mosque: 26 nouns, 33 verbs, 11 phrases
- 48_Story: 51 nouns, 48 verbs, 10 phrases
- 49_Eloquence_of_the_Quran: 42 nouns, 50 verbs, 8 phrases
- 50_Story_2: 56 nouns, 43 verbs, 12 phrases
- 51_Islam_and_Western_Philosophies: 71 nouns, 44 verbs, 123 phrases

## Folder names

Lesson folders are prefixed with two-digit numbers for ordering and then an English semantic title inferred from the PDF lesson title/content.
## Phrase images

Each lesson now includes a `phrase_images/` folder. `phrases.csv` has an `arabic_image` column pointing to a cropped PNG of the Arabic phrase from the source PDF. Use this when copied Arabic text has bad shaping or spacing artifacts.
## Arabic images

All Arabic vocabulary items now include tightly cropped PNG images from the source PDF. The image crops use the text bounding box inside each table cell with minimal padding to limit surrounding whitespace. Prefer the `*_image` columns for display when accurate Arabic shaping matters.

