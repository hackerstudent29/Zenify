import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/all_time_index.dart';
import '../../domain/replay_aggregate.dart';

/// Data model representing a Replay Quiz session.
class ReplayQuizData {
  final String targetArtist;
  final List<String> options;
  final List<String> clues;

  const ReplayQuizData({
    required this.targetArtist,
    required this.options,
    required this.clues,
  });

  static ReplayQuizData? buildQuiz(
    ReplayAggregate snapshot, {
    AllTimeIndex? allTimeIndex,
    int? seed,
  }) {
    if (snapshot.topArtists.isEmpty) return null;

    final target = snapshot.topArtists.first;
    final options = <String>[target.artistName];

    // Collect distractors from remaining top artists
    for (final artist in snapshot.topArtists.skip(1)) {
      if (options.length < 4 && !options.contains(artist.artistName)) {
        options.add(artist.artistName);
      }
    }

    // Fallback distractors if user has < 4 artists
    const fallbacks = [
      'Anirudh Ravichander',
      'A.R. Rahman',
      'Yuvan Shankar Raja',
      'Harris Jayaraj',
      'Santhosh Narayanan'
    ];
    for (final fb in fallbacks) {
      if (options.length < 4 && !options.contains(fb)) {
        options.add(fb);
      }
    }

    // Deterministic shuffle
    options.sort((a, b) {
      final codeA = a.codeUnitAt(0);
      final codeB = b.codeUnitAt(0);
      return (seed ?? 42) % 2 == 0 ? codeA.compareTo(codeB) : codeB.compareTo(codeA);
    });

    // Build 3 clues
    final clues = <String>[];

    // Clue 1: Listened duration
    clues.add('You listened to this artist for ${formatDuration(target.listenedMs)}');

    // Clue 2: Play count or unique tracks
    clues.add('You played ${target.trackCount} different tracks from their catalog');

    // Clue 3: Top song play frequency
    if (target.qualifiedPlays > 0) {
      clues.add('You accumulated ${target.qualifiedPlays} total plays for this artist');
    } else {
      clues.add('This artist defined your primary soundtrack this period');
    }

    return ReplayQuizData(
      targetArtist: target.artistName,
      options: options,
      clues: clues,
    );
  }
}

/// Pre-reveal guessing game: "Guess your #1 artist from 3 clues" (F20).
class ReplayQuizScreen extends StatefulWidget {
  final ReplayAggregate snapshot;
  final AllTimeIndex? allTimeIndex;
  final VoidCallback? onContinue;

  const ReplayQuizScreen({
    super.key,
    required this.snapshot,
    this.allTimeIndex,
    this.onContinue,
  });

  @override
  State<ReplayQuizScreen> createState() => _ReplayQuizScreenState();
}

class _ReplayQuizScreenState extends State<ReplayQuizScreen> {
  late ReplayQuizData? _quiz;
  int _revealedCluesCount = 1;
  String? _selectedOption;
  bool _answered = false;
  bool _isCorrect = false;
  int _score = 0;

  @override
  void initState() {
    super.initState();
    _quiz = ReplayQuizData.buildQuiz(
      widget.snapshot,
      allTimeIndex: widget.allTimeIndex,
    );
  }

  void _onSelectOption(String option) {
    if (_answered || _quiz == null) return;

    final correct = option == _quiz!.targetArtist;
    int points = 0;
    if (correct) {
      points = _revealedCluesCount == 1 ? 3 : (_revealedCluesCount == 2 ? 2 : 1);
    }

    setState(() {
      _selectedOption = option;
      _answered = true;
      _isCorrect = correct;
      _score = points;
    });
  }

  void _onRevealNextClue() {
    if (_quiz == null || _revealedCluesCount >= _quiz!.clues.length) return;
    setState(() {
      _revealedCluesCount++;
    });
  }

  void _onSkip() {
    if (_quiz == null) return;
    setState(() {
      _answered = true;
      _selectedOption = null;
      _isCorrect = false;
      _score = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_quiz == null) {
      return Scaffold(
        backgroundColor: const Color(0xFF121214),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Not enough data to generate quiz', style: TextStyle(color: Colors.white)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: widget.onContinue ?? () => Navigator.of(context).pop(),
                child: const Text('Continue to Replay'),
              ),
            ],
          ),
        ),
      );
    }

    final quiz = _quiz!;

    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppTheme.brand.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.psychology_rounded,
                          color: AppTheme.brand,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'REPLAY QUIZ',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.textPrimary,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                  if (!_answered)
                    TextButton(
                      onPressed: _onSkip,
                      child: const Text(
                        'SKIP',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textMuted,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                ],
              ),

              const SizedBox(height: 20),

              // Title Prompt
              const Text(
                'Guess your #1 artist from the clues below:',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),

              const SizedBox(height: 16),

              // Clues list
              Expanded(
                child: ListView(
                  children: [
                    for (int i = 0; i < quiz.clues.length; i++)
                      _buildClueCard(
                        index: i + 1,
                        text: quiz.clues[i],
                        isRevealed: i < _revealedCluesCount,
                      ),
                    if (!_answered && _revealedCluesCount < quiz.clues.length) ...[
                      const SizedBox(height: 12),
                      Center(
                        child: OutlinedButton.icon(
                          onPressed: _onRevealNextClue,
                          icon: const Icon(Icons.lightbulb_outline_rounded, size: 16),
                          label: Text(
                            'REVEAL CLUE ${_revealedCluesCount + 1}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppTheme.brand,
                            side: const BorderSide(color: AppTheme.brand),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              // Status Banner after answering
              if (_answered) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: _isCorrect
                        ? Colors.green.shade900.withValues(alpha: 0.3)
                        : Colors.red.shade900.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _isCorrect ? Colors.green.shade500 : Colors.red.shade500,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _isCorrect ? Icons.check_circle_rounded : Icons.info_outline_rounded,
                        color: _isCorrect ? Colors.green.shade400 : Colors.red.shade400,
                        size: 28,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _isCorrect
                                  ? 'Spot on! +$_score pts 🎯'
                                  : 'Not quite! Your #1 was:',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: _isCorrect ? Colors.green.shade300 : Colors.red.shade300,
                              ),
                            ),
                            Text(
                              quiz.targetArtist,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // Options Grid / List
              for (final option in quiz.options) ...[
                _buildOptionButton(option, quiz.targetArtist),
                const SizedBox(height: 10),
              ],

              const SizedBox(height: 12),

              // Continue Button
              if (_answered)
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: widget.onContinue ?? () => Navigator.of(context).pop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.brand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'CONTINUE TO REPLAY',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildClueCard({
    required int index,
    required String text,
    required bool isRevealed,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isRevealed ? AppTheme.surface : Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isRevealed ? AppTheme.border : Colors.white.withValues(alpha: 0.05),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              color: isRevealed ? AppTheme.brand : Colors.white.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              '$index',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isRevealed ? Colors.white : AppTheme.textMuted,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              isRevealed ? text : 'Locked clue (tap reveal)',
              style: TextStyle(
                fontSize: 13,
                fontWeight: isRevealed ? FontWeight.w600 : FontWeight.w400,
                color: isRevealed ? AppTheme.textPrimary : AppTheme.textMuted,
                fontStyle: isRevealed ? FontStyle.normal : FontStyle.italic,
              ),
            ),
          ),
          if (isRevealed)
            const Icon(Icons.check_rounded, color: AppTheme.brand, size: 18),
        ],
      ),
    );
  }

  Widget _buildOptionButton(String option, String targetArtist) {
    Color bg = AppTheme.surface;
    Color border = AppTheme.border;
    Color text = AppTheme.textPrimary;

    if (_answered) {
      if (option == targetArtist) {
        bg = Colors.green.shade900.withValues(alpha: 0.4);
        border = Colors.green.shade500;
        text = Colors.white;
      } else if (option == _selectedOption && !_isCorrect) {
        bg = Colors.red.shade900.withValues(alpha: 0.4);
        border = Colors.red.shade500;
        text = Colors.white;
      } else {
        bg = Colors.white.withValues(alpha: 0.02);
        text = AppTheme.textMuted;
      }
    }

    return InkWell(
      onTap: _answered ? null : () => _onSelectOption(option),
      borderRadius: BorderRadius.circular(12),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                option,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: text,
                ),
              ),
            ),
            if (_answered && option == targetArtist)
              const Icon(Icons.check_circle_rounded, color: Colors.greenAccent, size: 20),
            if (_answered && option == _selectedOption && !_isCorrect)
              const Icon(Icons.cancel_rounded, color: Colors.redAccent, size: 20),
          ],
        ),
      ),
    );
  }
}
