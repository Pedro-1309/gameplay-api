const fisher_yates_shuffle = (array) => {
    // Start from the last element and swap one by one
    for (let i = array.length - 1; i > 0; i--) {
        // Pick a random index from 0 to i
        const j = Math.floor(Math.random() * (i + 1));
        
        // Swap elements array[i] and array[j]
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = {
    fisher_yates_shuffle
};