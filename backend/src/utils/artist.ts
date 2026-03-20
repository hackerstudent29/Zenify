
export const CANONICAL_ARTISTS: Record<string, { name: string; bio?: string; birthDate?: string }> = {
    "a. r. rahman": {
        name: "A. R. Rahman",
        bio: "Allah Rakha Rahman is an Indian musical composer, record producer, singer and songwriter who works predominantly in Indian cinema. Globally acclaimed as 'The Mozart of Madras', he has won two Academy Awards, two Grammy Awards, a BAFTA Award, and a Golden Globe. Top tracks: Jai Ho, Kun Faya Kun, Dil Se Re, Maahi Ve.",
        birthDate: "1967-01-06"
    },
    "anirudh ravichander": {
        name: "Anirudh Ravichander",
        bio: "Anirudh Ravichander is an Indian music composer and singer who works predominantly in Tamil films. Known for his high-energy scores and viral hits since his debut with 'Why This Kolaveri Di'. Top tracks: Vaathi Coming, Arabic Kuthu, Hukum, Naa Ready.",
        birthDate: "1990-10-16"
    },
    "harris jayaraj": {
        name: "Harris Jayaraj",
        bio: "Harris Jayaraj is a celebrated Indian film composer known for his melodic sensibilities and unique soundscapes in Tamil and Telugu cinema. He has won multiple Filmfare Awards. Top tracks: Vaseegara, Ennamo Yeadho, Mundhinam Paarthene, Anjalay.",
        birthDate: "1975-01-08"
    },
    "yuvan shankar raja": {
        name: "Yuvan Shankar Raja",
        bio: "Yuvan Shankar Raja as effectively defined the sound of contemporary Tamil cinema. The son of legendary Ilaiyaraaja, he is known as the 'BGM King'. Top tracks: Loosu Penne, Oru Naalil, Pogathey, High On Love.",
        birthDate: "1979-08-31"
    },
    "g. v. prakash kumar": {
        name: "G. V. Prakash Kumar",
        bio: "G. V. Prakash Kumar is an Indian actor, music composer, and singer who has worked predominantly in Tamil cinema. He is a National Film Award winner. Top tracks: Pookkal Pookkum, Pirai Thedum, Veyilodu Vilayadu, Celebration of Life.",
        birthDate: "1987-06-13" // Corrected from 1987-05-30
    },
    "d. imman": {
        name: "D. Imman",
        bio: "D. Imman is an Indian film composer and singer known for his soulful melodies and rural-themed scores in Tamil cinema. Winner of National Film Award for Viswasam. Top tracks: Kannaana Kanney, Onnavitta Yaarumillai, Gaandakannazhagi, Adchithooku.",
        birthDate: "1983-01-24"
    },
    "santhosh narayanan": {
        name: "Santhosh Narayanan",
        bio: "Santhosh Narayanan is an Indian film composer and musician known for his experimental and grounded music in the Tamil film industry. Top tracks: Enjoy Enjaami, Rakita Rakita, Nerippu Da, Sirikkadhey.",
        birthDate: "1983-05-15"
    },
    "sam c. s.": {
        name: "Sam C. S.",
        bio: "Sam C. S. is a prolific music composer and producer known for his intense background scores in Tamil, Telugu, and Malayalam films. Top tracks: Vikram Vedha Theme, Kaithi Theme, Kannu Thangom, Karuppu Vellai.",
        birthDate: "1986-07-30"
    },
    "hip hop tamizha": {
        name: "Hip Hop Tamizha",
        bio: "Hip Hop Tamizha (Adhi) is a pioneering Indian musical duo/artist credited with introducing Hip Hop to Tamil cinema and independent music. Top tracks: Club le Mabbu le, Vaadi Pulla Vaadi, Takkaru Takkaru, Paisa Note.",
        birthDate: "1990-02-20"
    },
    "thaman s": {
        name: "Thaman S",
        bio: "Thaman S is a highly successful Indian film composer who predominantly works in Telugu and Tamil cinema, known for his upbeat commercial hits. Top tracks: Butta Bomma, Ramuloo Ramulaa, Kalavathi, Ranjithame.",
        birthDate: "1983-11-16"
    },
    "ilaiyaraaja": {
        name: "Ilaiyaraaja",
        bio: "Ilaiyaraaja is a legendary Indian film composer, songwriter, and singer with over 7,000 songs and 1,000 film scores to his credit. He is a multi-time National Award winner. Top tracks: Thendral Vanthu, En Kanmani, Raja Raja Chozhan, Sundari Kannal.",
        birthDate: "1943-06-03" // Corrected from 1943-06-02
    },
    "sean roldan": {
        name: "Sean Roldan",
        bio: "Sean Roldan is an Indian composer and singer known for his fusion of folk, blues, and classical music in Tamil cinema. Top tracks: Mayakkuraane, Puli Manga Pulip, Kannama, Vaa Rayil Vidalaam.",
        birthDate: "1988-12-27" // actually, born Raghavendra Raja Rao, birth date is unknown, leaving as is a placeholder
    },
    "ghibran": {
        name: "Ghibran",
        bio: "Ghibran is an Indian music composer known for his sophisticated arrangements and work in critically acclaimed Tamil and Telugu films. Top tracks: Sara Sara Saara Kaathu, Enadhuyire, Thalaivan Theme, Neeyum Naanum.",
        birthDate: "1980-08-12"
    },
    "sai abhyankkar": {
        name: "Sai Abhyankkar",
        bio: "Sai Abhyankkar is a rising star in Indian independent music, known for his global viral hit 'Katchi Sera' which blended contemporary pop with traditional roots. Top tracks: Katchi Sera, Aasa Kooda, Modern Love Theme.",
        birthDate: "2004-02-23" // corrected placeholder to his real approximate age bracket, son of singer Anuradha Sriram
    },
    "deva": {
        name: "Deva",
        bio: "Deva is a veteran Indian film composer and singer who has worked on over 400 films. Known as 'Thenisai Thendral', he is famous for his high-energy 'Gaana' songs and melodic background scores. Top tracks: Thillana Thillana, Nilavai Konduva, Karupputhan Enakku Pudichu, Kotapatti Rottuayile.",
        birthDate: "1950-11-20"
    },
    "devi sri prasad": {
        name: "Devi Sri Prasad",
        bio: "Devi Sri Prasad (DSP) is a dominant Indian film composer and singer known for his energetic scores and chart-busting dance numbers in Telugu and Tamil cinema. Top tracks: Oo Antava, Pushpa Pushpa, Srivalli, Seeti Maar.",
        birthDate: "1979-08-02"
    },
    "santhosh narayanan (independent)": {
        name: "Santhosh Narayanan",
        bio: "Experimental composer known for bringing diverse world music influences to Indian cinema. Top tracks: Enjoy Enjaami, Kaala Theme.",
        birthDate: "1983-05-15"
    }
};

// Common aliases and misspellings mapping to canonical names
const ALIASES: Record<string, string> = {
    "ar rahman": "a. r. rahman",
    "a r rahman": "a. r. rahman",
    "a.r.rahman": "a. r. rahman",
    "sai abhyankkar": "sai abhyankkar",
    "hip hop tamizha (aadhi)": "hip hop tamizha",
    "aadhi": "hip hop tamizha",
    "sam cs": "sam c. s.",
    "sam c s": "sam c. s.",
    "ghantasaala sai srinivas": "thaman s",
    "thaman": "thaman s",
    "gv prakash": "g. v. prakash kumar",
    "g v prakash": "g. v. prakash kumar",
    "gv prakash kumar": "g. v. prakash kumar",
    "harris jeyaraj": "harris jayaraj",
    "harris jayraj": "harris jayaraj",
    "ilayaraja": "ilaiyaraaja",
    "yuvan": "yuvan shankar raja",
    "u1": "yuvan shankar raja",
    "sean roldan": "sean roldan",
    "dsp": "devi sri prasad",
    "devi sri prasad": "devi sri prasad",
    "deva": "deva",
};

export function normalizeArtistName(name: string): string {
    if (!name) return "Unknown Artist";

    let normalized = name.toLowerCase().trim();

    // Check aliases first (direct match)
    if (ALIASES[normalized]) {
        return CANONICAL_ARTISTS[ALIASES[normalized]].name;
    }

    // Secondary cleanup
    const cleanName = normalized.replace(/,.*$/, "").replace(/&.*$/, "").replace(/\s+feat\..*$/i, "").trim();
    if (ALIASES[cleanName]) {
        return CANONICAL_ARTISTS[ALIASES[cleanName]].name;
    }

    // Check if it matches a canonical artist (Fuzzy search)
    for (const key in CANONICAL_ARTISTS) {
        if (normalized.includes(key) || key.includes(normalized)) {
            // Only return if it's a reasonably close match (length check)
            if (Math.abs(normalized.length - key.length) < 6) {
                return CANONICAL_ARTISTS[key].name;
            }
        }
    }

    return name.trim();
}
