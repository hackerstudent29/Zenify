import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../shared/providers/audio_provider.dart';

class StudioFxBottomSheet extends ConsumerStatefulWidget {
  const StudioFxBottomSheet({super.key});

  @override
  ConsumerState<StudioFxBottomSheet> createState() => _StudioFxBottomSheetState();
}

class _StudioFxBottomSheetState extends ConsumerState<StudioFxBottomSheet> {
  double _speed = 1.0;
  double _pitch = 1.0;
  
  // Placeholders for UI parity
  final List<double> _eq = [0, 0, 0];
  bool _is8D = false;
  String _reverb = 'none';

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF111111),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Row(
            children: [
              Icon(LucideIcons.sparkles, color: Color(0xFFE11D48), size: 24),
              SizedBox(width: 12),
              Text(
                'StudioFX Engine',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'Orange Avenue',
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          
          _buildSectionTitle('Playback Speed & Pitch'),
          _buildSlider(
            label: 'Speed',
            value: _speed,
            min: 0.5,
            max: 2.0,
            onChanged: (val) {
              setState(() => _speed = val);
              ref.read(audioHandlerProvider).customAction('setSpeed', {'speed': val});
            },
          ),
          _buildSlider(
            label: 'Pitch',
            value: _pitch,
            min: 0.5,
            max: 2.0,
            onChanged: (val) {
              setState(() => _pitch = val);
              // Not supported directly in all standard handler setups, but available via just_audio's setPitch 
              // Requires custom action implementation in MyAudioHandler
              ref.read(audioHandlerProvider).customAction('setPitch', {'pitch': val});
            },
          ),
          
          const SizedBox(height: 16),
          _buildSectionTitle('Spatial Audio (Coming Soon to Mobile)'),
          SwitchListTile(
            title: const Text('8D Audio', style: TextStyle(color: Colors.white)),
            subtitle: const Text('Simulates 360° sound', style: TextStyle(color: Colors.white54, fontSize: 12)),
            value: _is8D,
            activeColor: const Color(0xFFE11D48),
            onChanged: (val) {
              setState(() => _is8D = val);
            },
            contentPadding: EdgeInsets.zero,
          ),
          
          const SizedBox(height: 16),
          _buildSectionTitle('Environment Reverb (Coming Soon)'),
          Row(
            children: [
              _buildReverbChip('None', 'none'),
              const SizedBox(width: 8),
              _buildReverbChip('Warehouse', 'warehouse'),
              const SizedBox(width: 8),
              _buildReverbChip('Cathedral', 'cathedral'),
            ],
          ),
          
          const SizedBox(height: 24),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _buildSlider({
    required String label,
    required double value,
    required double min,
    required double max,
    required ValueChanged<double> onChanged,
  }) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 14)),
            Text('${value.toStringAsFixed(2)}x', style: const TextStyle(color: Colors.white54, fontSize: 12)),
          ],
        ),
        SliderTheme(
          data: SliderThemeData(
            trackHeight: 2,
            activeTrackColor: const Color(0xFFE11D48),
            inactiveTrackColor: Colors.white12,
            thumbColor: Colors.white,
            overlayColor: const Color(0xFFE11D48).withOpacity(0.1),
          ),
          child: Slider(
            value: value,
            min: min,
            max: max,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }

  Widget _buildReverbChip(String label, String value) {
    final isSelected = _reverb == value;
    return GestureDetector(
      onTap: () {
        setState(() => _reverb = value);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFE11D48).withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? const Color(0xFFE11D48) : Colors.white12,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? const Color(0xFFE11D48) : Colors.white54,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
